/**
 * Presale Pay Orders (external deposits: SOL / ETH / USDT / USDC / BTC).
 * In-memory + /tmp JSON MVP. Document Redis/Postgres for production.
 *
 * Flow: create order → user sends exact payAmount → confirm scans & credits.
 */

import fs from "fs";
import path from "path";
import { getAddress, isAddress } from "viem";
import {
  DEFAULT_BTC_DEPOSIT_ADDRESS,
  DEFAULT_EVM_DEPOSIT_ADDRESS,
  DEFAULT_SOL_DEPOSIT_ADDRESS,
} from "@/lib/acceptedPayAssets";
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

const ORDER_TTL_MS = 45 * 60 * 1000; // 45 minutes
const STORE_PATH =
  process.env.PRESALE_ORDERS_PATH?.trim() ||
  path.join("/tmp", "overlandcoin-presale-orders.json");

const memory = new Map<string, PayOrder>();

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

function loadDisk(): void {
  try {
    if (!fs.existsSync(STORE_PATH)) return;
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const rows = JSON.parse(raw) as PayOrder[];
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (row?.orderId) memory.set(row.orderId, row);
    }
  } catch {
    /* ignore corrupt MVP store */
  }
}

let diskLoaded = false;
function ensureLoaded() {
  if (!diskLoaded) {
    loadDisk();
    diskLoaded = true;
  }
}

function persistDisk() {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const rows = [...memory.values()].sort((a, b) => b.createdAt - a.createdAt);
    // Cap file size — keep last 500
    fs.writeFileSync(STORE_PATH, JSON.stringify(rows.slice(0, 500), null, 2), "utf8");
  } catch {
    /* /tmp may be unavailable in some runtimes — memory still works */
  }
}

function newOrderId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ord_${Date.now().toString(36)}_${rand}`;
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
      return Math.max(0.02, expected * 0.002);
    case "BTC":
      return Math.max(0.00002, expected * 0.002); // ~2k sats floor
    case "SOL":
      return Math.max(0.00005, expected * 0.002);
    case "ETH":
      return Math.max(0.00005, expected * 0.002);
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

export function getOrder(orderId: string): PayOrder | null {
  ensureLoaded();
  const o = memory.get(orderId);
  if (!o) return null;
  if (o.status === "pending" && Date.now() > o.expiresAt) {
    o.status = "expired";
    memory.set(orderId, o);
    persistDisk();
  }
  return o;
}

export function saveOrder(order: PayOrder): PayOrder {
  ensureLoaded();
  memory.set(order.orderId, order);
  persistDisk();
  return order;
}

export function listOrdersForBuyer(buyer: string, limit = 20): PayOrder[] {
  ensureLoaded();
  const b = buyer.toLowerCase();
  return [...memory.values()]
    .filter((o) => o.buyer.toLowerCase() === b)
    .sort((a, b2) => b2.createdAt - a.createdAt)
    .slice(0, limit);
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
  ensureLoaded();

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

  saveOrder(order);
  return { ok: true, order };
}

/** Mark order paid/credited after verification. Idempotent. */
export function markOrderCredited(
  orderId: string,
  opts: { paymentTxHash: string; creditTxHash: string; olcAmount?: number },
): PayOrder | null {
  const order = getOrder(orderId);
  if (!order) return null;
  order.status = "credited";
  order.paymentTxHash = opts.paymentTxHash;
  order.creditTxHash = opts.creditTxHash;
  if (typeof opts.olcAmount === "number" && opts.olcAmount > 0) {
    order.olcAmount = opts.olcAmount;
  }
  return saveOrder(order);
}

export function markOrderPaid(orderId: string, paymentTxHash: string): PayOrder | null {
  const order = getOrder(orderId);
  if (!order) return null;
  if (order.status === "credited") return order;
  order.status = "paid";
  order.paymentTxHash = paymentTxHash;
  return saveOrder(order);
}

export const PRESALE_ORDER_TTL_MS = ORDER_TTL_MS;
