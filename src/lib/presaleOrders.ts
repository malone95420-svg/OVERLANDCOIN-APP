/**
 * Presale Pay Orders (external deposits: SOL / ETH / USDT / USDC / BTC).
 *
 * Durable on Upstash Redis (UPSTASH_REDIS_REST_URL + TOKEN) with TTL ~60 min.
 * In-memory is a same-instance cache only — do not rely on it across Vercel
 * serverless instances. Credit should prefer /api/presale/deliver with
 * buyer + paymentTxHash; order confirm updates Redis status when the order
 * is found.
 *
 * Flow: create order (quote UX) → user pays → deliver by tx hash (BDAG-style).
 */

import { Redis } from "@upstash/redis";
import { getAddress, isAddress } from "viem";
import {
  DEFAULT_BTC_DEPOSIT_ADDRESS,
  DEFAULT_EVM_DEPOSIT_ADDRESS,
  DEFAULT_SOL_DEPOSIT_ADDRESS,
} from "@/lib/acceptedPayAssets";
import { hasUpstashRedis } from "@/lib/auth/userStore";
import { calcOlcFromPay, calcPayFromOlc, fetchAllLivePrices } from "@/lib/livePrices";
import { PRESALE_BATCHES, SITE } from "@/lib/site";
import type { PayAssetId, PayChain } from "@/lib/verifyPayment";
import { inferChainFromAsset } from "@/lib/verifyPayment";

export type PayOrderStatus =
  | "pending"
  | "paid"
  | "credited"
  | "expired"
  | "cancelled";

export type PayOrder = {
  orderId: string;
  buyer: `0x${string}`;
  payAsset: PayAssetId;
  payChain: PayChain;
  /** Exact human units of pay asset expected */
  payAmount: number;
  olcAmount: number;
  batchPriceUsed: number;
  usdRateUsed: number;
  usdPaid: number;
  depositAddress: string;
  depositNetwork: string;
  status: PayOrderStatus;
  createdAt: number;
  expiresAt: number;
  paymentTxHash?: string;
  creditTxHash?: string;
  rateSource?: string;
};

/** Client-facing order TTL (pending window). */
const ORDER_TTL_MS = 45 * 60 * 1000; // 45 minutes
/** Redis key TTL — slightly longer so confirm can still load near-expiry orders. */
const REDIS_TTL_SEC = 60 * 60; // 60 minutes
const ORDER_KEY_PREFIX = "olc:presale:order:";
const BUYER_ORDERS_PREFIX = "olc:presale:buyer-orders:";

/** Same-instance cache only — never the source of truth on Vercel. */
const memory = new Map<string, PayOrder>();

function redisClient(): Redis | null {
  if (!hasUpstashRedis()) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

function orderKey(orderId: string): string {
  return ORDER_KEY_PREFIX + orderId;
}

function buyerOrdersKey(buyer: string): string {
  return BUYER_ORDERS_PREFIX + buyer.toLowerCase();
}

function liveBatchPrice(): number {
  const live = PRESALE_BATCHES.find((b) => b.status === "LIVE") ?? PRESALE_BATCHES[0];
  return live.priceUsdt;
}

function depositForAsset(asset: PayAssetId): {
  address: string;
  network: string;
} | null {
  switch (asset) {
    case "SOL":
      return {
        address:
          process.env.NEXT_PUBLIC_DEPOSIT_SOL?.trim() ||
          SITE.deposits?.solana ||
          DEFAULT_SOL_DEPOSIT_ADDRESS,
        network: process.env.NEXT_PUBLIC_DEPOSIT_SOL_NETWORK?.trim() || "Solana",
      };
    case "ETH":
      return {
        address:
          process.env.NEXT_PUBLIC_DEPOSIT_ETH?.trim() ||
          SITE.treasuryAddress ||
          DEFAULT_EVM_DEPOSIT_ADDRESS,
        network: process.env.NEXT_PUBLIC_DEPOSIT_ETH_NETWORK?.trim() || "Ethereum",
      };
    case "USDT":
      return {
        address:
          process.env.NEXT_PUBLIC_DEPOSIT_USDT?.trim() ||
          SITE.treasuryAddress ||
          DEFAULT_EVM_DEPOSIT_ADDRESS,
        network:
          process.env.NEXT_PUBLIC_DEPOSIT_USDT_NETWORK?.trim() ||
          "Ethereum (ERC-20)",
      };
    case "USDC":
      return {
        address:
          process.env.NEXT_PUBLIC_DEPOSIT_USDC?.trim() ||
          SITE.treasuryAddress ||
          DEFAULT_EVM_DEPOSIT_ADDRESS,
        network: process.env.NEXT_PUBLIC_DEPOSIT_USDC_NETWORK?.trim() || "Ethereum",
      };
    case "BTC":
      return {
        address:
          process.env.NEXT_PUBLIC_DEPOSIT_BTC?.trim() ||
          SITE.deposits?.bitcoin ||
          DEFAULT_BTC_DEPOSIT_ADDRESS,
        network:
          process.env.NEXT_PUBLIC_DEPOSIT_BTC_NETWORK?.trim() ||
          "Bitcoin (native SegWit)",
      };
    default:
      return null;
  }
}

function newOrderId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ord_${Date.now().toString(36)}_${rand}`;
}

function normalizeOrder(raw: unknown): PayOrder | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as PayOrder;
  if (!o.orderId || typeof o.orderId !== "string") return null;
  if (!o.buyer || typeof o.buyer !== "string") return null;
  return o;
}

function maybeExpire(order: PayOrder): PayOrder {
  if (order.status === "pending" && Date.now() > order.expiresAt) {
    return { ...order, status: "expired" };
  }
  return order;
}

function redisTtlSec(order: PayOrder): number {
  const remainingMs = Math.max(0, order.expiresAt - Date.now());
  // Keep at least a short window after expiry so confirm can return 410 expired.
  const sec = Math.ceil(remainingMs / 1000) + 15 * 60;
  return Math.min(REDIS_TTL_SEC, Math.max(60, sec));
}

/** Round pay amount for display / matching (asset-aware). */
export function roundPayAmount(asset: PayAssetId, amount: number): number {
  if (!(amount > 0) || !Number.isFinite(amount)) return 0;
  switch (asset) {
    case "BTC":
      return Number(amount.toFixed(8));
    case "SOL":
      return Number(amount.toFixed(6));
    case "ETH":
      return Number(amount.toFixed(6));
    case "USDT":
    case "USDC":
      return Number(amount.toFixed(2));
    default:
      return Number(amount.toFixed(8));
  }
}

export function amountTolerance(asset: PayAssetId, expected: number): number {
  switch (asset) {
    case "USDT":
    case "USDC":
      return Math.max(0.05, expected * 0.003);
    case "BTC":
      return Math.max(0.00003, expected * 0.003); // ~3k sats floor
    case "SOL":
      return Math.max(0.0001, expected * 0.003);
    case "ETH":
      return Math.max(0.00008, expected * 0.003);
    default:
      return Math.max(0.0001, expected * 0.005);
  }
}

export function amountsMatch(
  asset: PayAssetId,
  expected: number,
  actual: number,
): boolean {
  if (!(expected > 0) || !(actual > 0)) return false;
  return Math.abs(actual - expected) <= amountTolerance(asset, expected);
}

export async function getOrder(orderId: string): Promise<PayOrder | null> {
  if (!orderId || orderId.length < 8) return null;

  const cached = memory.get(orderId);
  if (cached) {
    const expired = maybeExpire(cached);
    if (expired !== cached) {
      memory.set(orderId, expired);
      void saveOrder(expired);
    }
    return expired;
  }

  const r = redisClient();
  if (r) {
    try {
      const raw = await r.get<PayOrder | string>(orderKey(orderId));
      const parsed =
        typeof raw === "string"
          ? normalizeOrder(JSON.parse(raw) as unknown)
          : normalizeOrder(raw);
      if (!parsed) return null;
      const expired = maybeExpire(parsed);
      memory.set(orderId, expired);
      if (expired.status !== parsed.status) {
        await saveOrder(expired);
      }
      return expired;
    } catch (e) {
      console.warn(
        "[presaleOrders] getOrder Redis failed",
        e instanceof Error ? e.message : e,
      );
      return null;
    }
  }

  return null;
}

export async function saveOrder(order: PayOrder): Promise<PayOrder> {
  memory.set(order.orderId, order);

  const r = redisClient();
  if (r) {
    try {
      const ttl = redisTtlSec(order);
      await r.set(orderKey(order.orderId), order, { ex: ttl });
      const bKey = buyerOrdersKey(order.buyer);
      await r.sadd(bKey, order.orderId);
      await r.expire(bKey, REDIS_TTL_SEC);
    } catch (e) {
      console.warn(
        "[presaleOrders] saveOrder Redis failed",
        e instanceof Error ? e.message : e,
      );
    }
  } else if (process.env.NODE_ENV === "production") {
    console.warn(
      "[presaleOrders] no Upstash Redis — order saved in memory only (will 404 on other instances). Set UPSTASH_REDIS_REST_*.",
    );
  }

  return order;
}

export async function listOrdersForBuyer(
  buyer: string,
  limit = 20,
): Promise<PayOrder[]> {
  const b = buyer.toLowerCase();
  const n = Math.min(Math.max(1, Math.floor(limit) || 20), 50);
  const r = redisClient();

  if (r) {
    try {
      const ids = (await r.smembers(buyerOrdersKey(b))) as string[];
      const rows: PayOrder[] = [];
      for (const id of ids.slice(0, 80)) {
        if (typeof id !== "string") continue;
        const o = await getOrder(id);
        if (o && o.buyer.toLowerCase() === b) rows.push(o);
      }
      return rows.sort((a, b2) => b2.createdAt - a.createdAt).slice(0, n);
    } catch (e) {
      console.warn(
        "[presaleOrders] listOrdersForBuyer Redis failed",
        e instanceof Error ? e.message : e,
      );
    }
  }

  return [...memory.values()]
    .filter((o) => o.buyer.toLowerCase() === b)
    .sort((a, b2) => b2.createdAt - a.createdAt)
    .slice(0, n);
}

export type CreateOrderInput = {
  buyer: string;
  payAsset: string;
  olcAmount?: number | null;
  payAmount?: number | null;
};

export type CreateOrderResult =
  | { ok: true; order: PayOrder }
  | { ok: false; error: string; status?: number };

const EXTERNAL_ASSETS: PayAssetId[] = ["SOL", "ETH", "USDT", "USDC", "BTC"];

export async function createPayOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const buyerRaw = input.buyer?.trim() ?? "";
  if (!buyerRaw || !isAddress(buyerRaw)) {
    return {
      ok: false,
      error: "buyer must be your connected BlockDAG wallet (OLC credits there)",
      status: 400,
    };
  }
  const buyer = getAddress(buyerRaw);

  const asset = (input.payAsset ?? "").trim().toUpperCase() as PayAssetId;
  if (!EXTERNAL_ASSETS.includes(asset)) {
    return {
      ok: false,
      error: "payAsset must be SOL, ETH, USDT, USDC, or BTC (use on-chain Buy for BDAG/BDUSD)",
      status: 400,
    };
  }

  const dep = depositForAsset(asset);
  if (!dep?.address) {
    return { ok: false, error: `No deposit address configured for ${asset}`, status: 503 };
  }

  const chain = inferChainFromAsset(asset);
  if (!chain) {
    return { ok: false, error: "Unsupported payAsset", status: 400 };
  }

  if (!hasUpstashRedis() && process.env.NODE_ENV === "production") {
    console.warn(
      "[presaleOrders] creating order without Redis — confirm may 404 on another instance; deliver-by-tx remains the credit path",
    );
  }

  const prices = await fetchAllLivePrices();
  const rateKey =
    asset === "SOL"
      ? prices.solUsd
      : asset === "ETH"
        ? prices.ethUsd
        : asset === "BTC"
          ? prices.btcUsd
          : asset === "USDT"
            ? prices.usdtUsd
            : prices.usdcUsd;
  if (rateKey == null || !(rateKey > 0)) {
    return {
      ok: false,
      error: `Live ${asset}/USD price unavailable — try again shortly`,
      status: 503,
    };
  }

  const batchPriceUsed = liveBatchPrice();
  if (!(batchPriceUsed > 0)) {
    return { ok: false, error: "Live batch price unavailable", status: 503 };
  }

  const clientOlc =
    typeof input.olcAmount === "number" ? input.olcAmount : Number(input.olcAmount);
  const clientPay =
    typeof input.payAmount === "number" ? input.payAmount : Number(input.payAmount);

  let payAmount = 0;
  let olcAmount = 0;
  let usdPaid = 0;

  if (Number.isFinite(clientPay) && clientPay > 0) {
    payAmount = roundPayAmount(asset, clientPay);
    const calc = calcOlcFromPay({
      payTokenAmount: payAmount,
      usdPerPayUnit: rateKey,
      batchPriceUsdt: batchPriceUsed,
    });
    olcAmount = calc.olcAmount;
    usdPaid = calc.usdPaid;
  } else if (Number.isFinite(clientOlc) && clientOlc > 0) {
    const calc = calcPayFromOlc({
      olcAmount: clientOlc,
      usdPerPayUnit: rateKey,
      batchPriceUsdt: batchPriceUsed,
    });
    payAmount = roundPayAmount(asset, calc.payTokenAmount);
    // Recompute OLC from rounded pay so quote matches what user must send
    const again = calcOlcFromPay({
      payTokenAmount: payAmount,
      usdPerPayUnit: rateKey,
      batchPriceUsdt: batchPriceUsed,
    });
    olcAmount = again.olcAmount;
    usdPaid = again.usdPaid;
  } else {
    return {
      ok: false,
      error: "Provide olcAmount or payAmount (positive number)",
      status: 400,
    };
  }

  if (!(payAmount > 0) || !(olcAmount > 0)) {
    return { ok: false, error: "Computed order amounts are zero", status: 400 };
  }

  const now = Date.now();
  const order: PayOrder = {
    orderId: newOrderId(),
    buyer,
    payAsset: asset,
    payChain: chain,
    payAmount,
    olcAmount,
    batchPriceUsed,
    usdRateUsed: rateKey,
    usdPaid,
    depositAddress: dep.address,
    depositNetwork: dep.network,
    status: "pending",
    createdAt: now,
    expiresAt: now + ORDER_TTL_MS,
    rateSource:
      asset === "SOL"
        ? prices.sources?.sol
        : asset === "ETH"
          ? prices.sources?.eth
          : asset === "BTC"
            ? prices.sources?.btc
            : asset === "USDT"
              ? prices.sources?.usdt ?? "peg"
              : prices.sources?.usdc ?? "peg",
  };

  await saveOrder(order);
  return { ok: true, order };
}

/** Mark order paid/credited after verification. Idempotent. */
export async function markOrderCredited(
  orderId: string,
  opts: { paymentTxHash: string; creditTxHash: string; olcAmount?: number },
): Promise<PayOrder | null> {
  const order = await getOrder(orderId);
  if (!order) return null;
  order.status = "credited";
  order.paymentTxHash = opts.paymentTxHash;
  order.creditTxHash = opts.creditTxHash;
  if (typeof opts.olcAmount === "number" && opts.olcAmount > 0) {
    order.olcAmount = opts.olcAmount;
  }
  return saveOrder(order);
}

export async function markOrderPaid(
  orderId: string,
  paymentTxHash: string,
): Promise<PayOrder | null> {
  const order = await getOrder(orderId);
  if (!order) return null;
  if (order.status === "credited") return order;
  order.status = "paid";
  order.paymentTxHash = paymentTxHash;
  return saveOrder(order);
}

export const PRESALE_ORDER_TTL_MS = ORDER_TTL_MS;
