/**
 * On-chain / network payment verification before PresaleLock credit.
 * Never trust client olcAmount or unverified paymentTxHash claims.
 *
 * Idempotency key = paymentTxHash (normalized). Persist in Redis later.
 */

import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  parseAbiItem,
  type Hash,
  type Hex,
  type TransactionReceipt,
} from "viem";
import { mainnet } from "viem/chains";
import {
  DEFAULT_BTC_DEPOSIT_ADDRESS,
  DEFAULT_EVM_DEPOSIT_ADDRESS,
  DEFAULT_SOL_DEPOSIT_ADDRESS,
} from "@/lib/acceptedPayAssets";
import { blockdag } from "@/lib/chain";
import { calcOlcFromPay, fetchAllLivePrices, type LivePricesResponse } from "@/lib/livePrices";
import { BDUSD_ADDRESS } from "@/lib/payTokens";
import { presaleReadRpcUrls } from "@/lib/presaleLock";
import { PRESALE_BATCHES, SITE } from "@/lib/site";

export type PayChain = "blockdag" | "ethereum" | "bitcoin" | "solana";

export type PayAssetId =
  | "BDAG"
  | "BDUSD"
  | "ETH"
  | "USDT"
  | "USDC"
  | "BTC"
  | "SOL";

export type VerifiedPayment = {
  chain: PayChain;
  payAsset: PayAssetId;
  paymentTxHash: string;
  /** Human units of the pay asset (e.g. 1.5 BDAG, 100 USDT) */
  payAmount: number;
  /** Address that sent the payment when known (EVM / Solana pubkey) */
  payerFrom?: string;
  /** Treasury / deposit address that received funds */
  treasuryTo: string;
  confirmations?: number;
};

export type OlcQuote = {
  usdRateUsed: number;
  batchPriceUsed: number;
  usdPaid: number;
  olcAmount: number;
  rateSource: string;
};

export type VerifyAndQuoteResult =
  | { ok: true; payment: VerifiedPayment; quote: OlcQuote }
  | { ok: false; error: string; status?: number };

const TRANSFER_EVENT = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

const ETH_USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7" as const;
const ETH_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;

const BTC_MIN_CONFIRMATIONS = 1;
/** Reject client olc if it exceeds computed by more than this fraction. */
const CLIENT_OLC_TOLERANCE = 0.01;

function treasuryEvm(): `0x${string}` {
  const raw =
    process.env.NEXT_PUBLIC_DEPOSIT_ETH?.trim() ||
    SITE.treasuryAddress ||
    DEFAULT_EVM_DEPOSIT_ADDRESS;
  return getAddress(raw);
}

function btcDeposit(): string {
  return (
    process.env.NEXT_PUBLIC_DEPOSIT_BTC?.trim() ||
    SITE.deposits.bitcoin ||
    DEFAULT_BTC_DEPOSIT_ADDRESS
  ).toLowerCase();
}

function solDeposit(): string {
  return (
    process.env.NEXT_PUBLIC_DEPOSIT_SOL?.trim() ||
    SITE.deposits.solana ||
    DEFAULT_SOL_DEPOSIT_ADDRESS
  );
}

function liveBatchPrice(): number {
  const live = PRESALE_BATCHES.find((b) => b.status === "LIVE") ?? PRESALE_BATCHES[0];
  return live.priceUsdt;
}

function ethereumRpcUrls(): string[] {
  const env = process.env.ETHEREUM_RPC_URL?.trim();
  const list = [
    env,
    "https://ethereum.publicnode.com",
    "https://cloudflare-eth.com",
    "https://rpc.ankr.com/eth",
    "https://eth.llamarpc.com",
  ].filter((u): u is string => Boolean(u));
  return [...new Set(list)];
}

function solanaRpcUrls(): string[] {
  const env = process.env.SOLANA_RPC_URL?.trim();
  const list = [
    env,
    "https://api.mainnet-beta.solana.com",
    "https://solana-rpc.publicnode.com",
  ].filter((u): u is string => Boolean(u));
  return [...new Set(list)];
}

function normalizeTxHash(raw: string): string {
  return raw.trim();
}

function isEvmTxHash(h: string): h is Hash {
  return /^0x[a-fA-F0-9]{64}$/.test(h);
}

function addrEq(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Map pay asset → live USD from prices bundle. */
function usdRateForAsset(
  asset: PayAssetId,
  prices: LivePricesResponse,
): { usd: number; source: string } | null {
  switch (asset) {
    case "BDAG":
      return prices.bdagUsd != null && prices.bdagUsd > 0
        ? { usd: prices.bdagUsd, source: prices.sources?.bdag ?? prices.source ?? "live" }
        : null;
    case "BDUSD":
      return { usd: prices.bdusdUsd, source: prices.sources?.bdusd ?? "peg" };
    case "USDT":
      return { usd: prices.usdtUsd, source: prices.sources?.usdt ?? "peg" };
    case "USDC":
      return { usd: prices.usdcUsd, source: prices.sources?.usdc ?? "peg" };
    case "ETH":
      return prices.ethUsd != null && prices.ethUsd > 0
        ? { usd: prices.ethUsd, source: prices.sources?.eth ?? "live" }
        : null;
    case "BTC":
      return prices.btcUsd != null && prices.btcUsd > 0
        ? { usd: prices.btcUsd, source: prices.sources?.btc ?? "live" }
        : null;
    case "SOL":
      return prices.solUsd != null && prices.solUsd > 0
        ? { usd: prices.solUsd, source: prices.sources?.sol ?? "live" }
        : null;
    default:
      return null;
  }
}

export function computeOlcQuote(
  payAsset: PayAssetId,
  payAmount: number,
  prices: LivePricesResponse,
): OlcQuote | { error: string } {
  const rate = usdRateForAsset(payAsset, prices);
  if (!rate) {
    return { error: `Live ${payAsset}/USD price unavailable — cannot compute OLC` };
  }
  const batchPriceUsed = liveBatchPrice();
  if (!(batchPriceUsed > 0)) {
    return { error: "Live batch price unavailable" };
  }
  const { usdPaid, olcAmount } = calcOlcFromPay({
    payTokenAmount: payAmount,
    usdPerPayUnit: rate.usd,
    batchPriceUsdt: batchPriceUsed,
  });
  if (!(olcAmount > 0) || !(usdPaid > 0)) {
    return { error: "Computed OLC amount is zero" };
  }
  return {
    usdRateUsed: rate.usd,
    batchPriceUsed,
    usdPaid,
    olcAmount,
    rateSource: rate.source,
  };
}

/**
 * Resolve final OLC: always use server-computed.
 * If client sent olcAmount and it exceeds computed by >1%, reject.
 * If client is lower, use min (never over-credit).
 */
export function resolveOlcAmount(
  computed: number,
  clientOlc?: number | null,
): { olcAmount: number } | { error: string } {
  if (!(computed > 0) || !Number.isFinite(computed)) {
    return { error: "Invalid computed olcAmount" };
  }
  // Always prefer server-computed from verified pay × live USD ÷ batch.
  // Cap to client only when client is lower (never over-credit vs verified math).
  // If client is higher (stale quote / inflate attempt), ignore client and use computed.
  if (clientOlc == null || !Number.isFinite(clientOlc) || clientOlc <= 0) {
    return { olcAmount: computed };
  }
  if (clientOlc > computed * (1 + CLIENT_OLC_TOLERANCE)) {
    // Inflate attempt or price moved — credit verified amount only
    return { olcAmount: computed };
  }
  return { olcAmount: Math.min(clientOlc, computed) };
}

async function verifyBlockdagPayment(opts: {
  paymentTxHash: string;
  buyer?: string;
  payAsset?: PayAssetId;
}): Promise<{ ok: true; payment: VerifiedPayment } | { ok: false; error: string }> {
  const hash = normalizeTxHash(opts.paymentTxHash);
  if (!isEvmTxHash(hash)) {
    return { ok: false, error: "paymentTxHash must be a 0x… EVM transaction hash" };
  }

  const treasury = treasuryEvm();
  const urls = presaleReadRpcUrls();
  let lastErr = "No BlockDAG RPC available";

  for (const url of urls) {
    try {
      const pc = createPublicClient({
        chain: blockdag,
        transport: http(url, { timeout: 15_000 }),
      });

      const [tx, receipt] = await Promise.all([
        pc.getTransaction({ hash }),
        pc.getTransactionReceipt({ hash }),
      ]);

      if (!receipt || receipt.status !== "success") {
        return { ok: false, error: "BlockDAG payment transaction failed or not successful" };
      }

      const preferAsset = opts.payAsset;

      // Native BDAG transfer to treasury
      if (
        (!preferAsset || preferAsset === "BDAG") &&
        tx.to &&
        addrEq(tx.to, treasury) &&
        tx.value > 0n
      ) {
        const payAmount = Number(formatUnits(tx.value, 18));
        if (!(payAmount > 0)) {
          return { ok: false, error: "Native BDAG transfer value is zero" };
        }
        if (opts.buyer && isAddress(opts.buyer) && !addrEq(tx.from, opts.buyer)) {
          // Allow credit to buyer if they claim a different address only when
          // they are explicitly the payer — reject mismatch.
          return {
            ok: false,
            error: `Payment from ${tx.from} does not match buyer ${opts.buyer}`,
          };
        }
        return {
          ok: true,
          payment: {
            chain: "blockdag",
            payAsset: "BDAG",
            paymentTxHash: hash.toLowerCase(),
            payAmount,
            payerFrom: getAddress(tx.from),
            treasuryTo: treasury,
          },
        };
      }

      // BDUSD ERC-20 Transfer to treasury
      if (!preferAsset || preferAsset === "BDUSD") {
        const transfer = findErc20TransferTo(receipt, BDUSD_ADDRESS, treasury);
        if (transfer) {
          const payAmount = Number(formatUnits(transfer.value, 18));
          if (!(payAmount > 0)) {
            return { ok: false, error: "BDUSD transfer amount is zero" };
          }
          if (
            opts.buyer &&
            isAddress(opts.buyer) &&
            !addrEq(transfer.from, opts.buyer) &&
            !addrEq(tx.from, opts.buyer)
          ) {
            return {
              ok: false,
              error: `BDUSD payment from ${transfer.from} does not match buyer ${opts.buyer}`,
            };
          }
          return {
            ok: true,
            payment: {
              chain: "blockdag",
              payAsset: "BDUSD",
              paymentTxHash: hash.toLowerCase(),
              payAmount,
              payerFrom: getAddress(transfer.from),
              treasuryTo: treasury,
            },
          };
        }
      }

      return {
        ok: false,
        error: `No BDAG native or BDUSD transfer to treasury ${treasury} found in tx`,
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  return { ok: false, error: `BlockDAG verification failed: ${lastErr}` };
}

function findErc20TransferTo(
  receipt: TransactionReceipt,
  token: string,
  to: string,
): { from: `0x${string}`; value: bigint } | null {
  for (const log of receipt.logs) {
    if (!addrEq(log.address, token)) continue;
    // topics: Transfer sig, from, to
    if (log.topics.length < 3) continue;
    const transferTopic =
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
    if (!addrEq(log.topics[0] ?? "", transferTopic)) continue;
    const toTopic = log.topics[2];
    if (!toTopic) continue;
    const toAddr = getAddress(`0x${toTopic.slice(-40)}`);
    if (!addrEq(toAddr, to)) continue;
    const fromTopic = log.topics[1];
    if (!fromTopic) continue;
    const fromAddr = getAddress(`0x${fromTopic.slice(-40)}`);
    const value = BigInt(log.data || "0x0");
    if (value <= 0n) continue;
    return { from: fromAddr, value };
  }
  // Silence unused — TRANSFER_EVENT kept for documentation / future decodeEventLog
  void TRANSFER_EVENT;
  return null;
}

async function verifyEthereumPayment(opts: {
  paymentTxHash: string;
  buyer?: string;
  payAsset: PayAssetId;
}): Promise<{ ok: true; payment: VerifiedPayment } | { ok: false; error: string }> {
  const hash = normalizeTxHash(opts.paymentTxHash);
  if (!isEvmTxHash(hash)) {
    return { ok: false, error: "paymentTxHash must be a 0x… EVM transaction hash" };
  }
  if (opts.payAsset !== "ETH" && opts.payAsset !== "USDT" && opts.payAsset !== "USDC") {
    return { ok: false, error: "Ethereum payAsset must be ETH, USDT, or USDC" };
  }

  const treasury = treasuryEvm();
  let lastErr = "No Ethereum RPC available";

  for (const url of ethereumRpcUrls()) {
    try {
      const pc = createPublicClient({
        chain: mainnet,
        transport: http(url, { timeout: 15_000 }),
      });

      const [tx, receipt] = await Promise.all([
        pc.getTransaction({ hash }),
        pc.getTransactionReceipt({ hash }),
      ]);

      if (!receipt || receipt.status !== "success") {
        return { ok: false, error: "Ethereum payment transaction failed or not successful" };
      }

      if (opts.payAsset === "ETH") {
        if (!tx.to || !addrEq(tx.to, treasury) || tx.value <= 0n) {
          return {
            ok: false,
            error: `No native ETH transfer to treasury ${treasury} found`,
          };
        }
        const payAmount = Number(formatUnits(tx.value, 18));
        if (opts.buyer && isAddress(opts.buyer) && !addrEq(tx.from, opts.buyer)) {
          // Buyer for lock credit is BlockDAG wallet; ETH payer may differ.
          // Require buyer to be provided as credit target — allow if different
          // only when explicitly intended: we require buyer wallet separately.
          // Soft: allow different from; credit still goes to buyer param.
        }
        return {
          ok: true,
          payment: {
            chain: "ethereum",
            payAsset: "ETH",
            paymentTxHash: hash.toLowerCase(),
            payAmount,
            payerFrom: getAddress(tx.from),
            treasuryTo: treasury,
          },
        };
      }

      const token = opts.payAsset === "USDT" ? ETH_USDT : ETH_USDC;
      const decimals = 6;
      const transfer = findErc20TransferTo(receipt, token, treasury);
      if (!transfer) {
        return {
          ok: false,
          error: `No ${opts.payAsset} Transfer to treasury ${treasury} found`,
        };
      }
      const payAmount = Number(formatUnits(transfer.value, decimals));
      if (!(payAmount > 0)) {
        return { ok: false, error: `${opts.payAsset} transfer amount is zero` };
      }
      return {
        ok: true,
        payment: {
          chain: "ethereum",
          payAsset: opts.payAsset,
          paymentTxHash: hash.toLowerCase(),
          payAmount,
          payerFrom: getAddress(transfer.from),
          treasuryTo: treasury,
        },
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  return { ok: false, error: `Ethereum verification failed: ${lastErr}` };
}

async function verifyBitcoinPayment(opts: {
  paymentTxHash: string;
}): Promise<{ ok: true; payment: VerifiedPayment } | { ok: false; error: string }> {
  const txid = normalizeTxHash(opts.paymentTxHash).replace(/^0x/i, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(txid)) {
    return { ok: false, error: "Bitcoin txid must be 64 hex characters" };
  }

  const expected = btcDeposit();
  const apis = [
    `https://mempool.space/api/tx/${txid}`,
    `https://blockstream.info/api/tx/${txid}`,
  ];

  let lastErr = "Bitcoin explorer unavailable";
  for (const url of apis) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status} from ${url}`;
        continue;
      }
      const data = (await res.json()) as {
        txid?: string;
        status?: { confirmed?: boolean; block_height?: number };
        vout?: Array<{
          value?: number;
          scriptpubkey_address?: string;
        }>;
      };

      let paidSats = 0;
      for (const out of data.vout ?? []) {
        const addr = (out.scriptpubkey_address ?? "").toLowerCase();
        if (addr === expected && typeof out.value === "number" && out.value > 0) {
          paidSats += out.value;
        }
      }
      if (paidSats <= 0) {
        return {
          ok: false,
          error: `No BTC output to deposit address ${expected} in this tx`,
        };
      }

      // Confirmations: prefer status endpoint
      let confirmations = 0;
      if (data.status?.confirmed) {
        try {
          const tipRes = await fetch(
            url.includes("mempool.space")
              ? "https://mempool.space/api/blocks/tip/height"
              : "https://blockstream.info/api/blocks/tip/height",
            { cache: "no-store" },
          );
          if (tipRes.ok) {
            const tip = Number(await tipRes.text());
            const height = data.status.block_height ?? tip;
            if (Number.isFinite(tip) && Number.isFinite(height)) {
              confirmations = Math.max(0, tip - height + 1);
            } else {
              confirmations = 1;
            }
          } else {
            confirmations = 1;
          }
        } catch {
          confirmations = 1;
        }
      }

      if (confirmations < BTC_MIN_CONFIRMATIONS) {
        return {
          ok: false,
          error: `Bitcoin tx needs ≥${BTC_MIN_CONFIRMATIONS} confirmation(s); currently ${confirmations}`,
        };
      }

      const payAmount = paidSats / 1e8;
      return {
        ok: true,
        payment: {
          chain: "bitcoin",
          payAsset: "BTC",
          paymentTxHash: txid,
          payAmount,
          treasuryTo: expected,
          confirmations,
        },
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  return { ok: false, error: `Bitcoin verification failed: ${lastErr}` };
}

async function verifySolanaPayment(opts: {
  paymentTxHash: string;
}): Promise<{ ok: true; payment: VerifiedPayment } | { ok: false; error: string }> {
  const sig = normalizeTxHash(opts.paymentTxHash);
  if (sig.length < 32 || sig.length > 128) {
    return { ok: false, error: "Invalid Solana transaction signature" };
  }

  const expected = solDeposit();
  let lastErr = "Solana RPC unavailable";

  for (const url of solanaRpcUrls()) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getTransaction",
          params: [
            sig,
            {
              encoding: "jsonParsed",
              maxSupportedTransactionVersion: 0,
              commitment: "confirmed",
            },
          ],
        }),
        cache: "no-store",
      });
      if (!res.ok) {
        lastErr = `HTTP ${res.status}`;
        continue;
      }
      const json = (await res.json()) as {
        result?: {
          meta?: {
            err?: unknown;
            preBalances?: number[];
            postBalances?: number[];
          };
          transaction?: {
            message?: {
              accountKeys?: Array<string | { pubkey?: string }>;
            };
          };
        } | null;
        error?: { message?: string };
      };
      if (json.error) {
        lastErr = json.error.message ?? "RPC error";
        continue;
      }
      if (!json.result) {
        return { ok: false, error: "Solana transaction not found (or not confirmed yet)" };
      }
      if (json.result.meta?.err) {
        return { ok: false, error: "Solana transaction failed on-chain" };
      }

      const keys = (json.result.transaction?.message?.accountKeys ?? []).map((k) =>
        typeof k === "string" ? k : k.pubkey ?? "",
      );
      const idx = keys.findIndex((k) => k === expected);
      if (idx < 0) {
        return {
          ok: false,
          error: `Solana tx does not involve deposit address ${expected}`,
        };
      }
      const pre = json.result.meta?.preBalances?.[idx] ?? 0;
      const post = json.result.meta?.postBalances?.[idx] ?? 0;
      const deltaLamports = post - pre;
      if (deltaLamports <= 0) {
        return {
          ok: false,
          error: "No positive SOL balance increase at deposit address in this tx",
        };
      }
      const payAmount = deltaLamports / 1e9;
      const payerFrom =
        typeof keys[0] === "string" && keys[0].length > 0 ? keys[0] : undefined;

      return {
        ok: true,
        payment: {
          chain: "solana",
          payAsset: "SOL",
          paymentTxHash: sig,
          payAmount,
          payerFrom,
          treasuryTo: expected,
        },
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }

  return { ok: false, error: `Solana verification failed: ${lastErr}` };
}

export async function verifyPayment(opts: {
  chain: PayChain;
  paymentTxHash: string;
  payAsset?: PayAssetId | string;
  buyer?: string;
}): Promise<{ ok: true; payment: VerifiedPayment } | { ok: false; error: string }> {
  const asset = (opts.payAsset ?? "").toUpperCase() as PayAssetId | "";

  switch (opts.chain) {
    case "blockdag": {
      const prefer =
        asset === "BDAG" || asset === "BDUSD" ? asset : undefined;
      return verifyBlockdagPayment({
        paymentTxHash: opts.paymentTxHash,
        buyer: opts.buyer,
        payAsset: prefer,
      });
    }
    case "ethereum": {
      const a =
        asset === "ETH" || asset === "USDT" || asset === "USDC" ? asset : null;
      if (!a) {
        return { ok: false, error: "payAsset required for ethereum: ETH | USDT | USDC" };
      }
      return verifyEthereumPayment({
        paymentTxHash: opts.paymentTxHash,
        buyer: opts.buyer,
        payAsset: a,
      });
    }
    case "bitcoin":
      return verifyBitcoinPayment({ paymentTxHash: opts.paymentTxHash });
    case "solana":
      return verifySolanaPayment({ paymentTxHash: opts.paymentTxHash });
    default:
      return { ok: false, error: `Unsupported chain: ${opts.chain}` };
  }
}

/** Verify payment + live quote in one shot. */
export async function verifyPaymentAndQuote(opts: {
  chain: PayChain;
  paymentTxHash: string;
  payAsset?: PayAssetId | string;
  buyer?: string;
  clientOlcAmount?: number | null;
}): Promise<VerifyAndQuoteResult> {
  const verified = await verifyPayment(opts);
  if (!verified.ok) {
    return { ok: false, error: verified.error, status: 400 };
  }

  const prices = await fetchAllLivePrices();
  const quoteOrErr = computeOlcQuote(
    verified.payment.payAsset,
    verified.payment.payAmount,
    prices,
  );
  if ("error" in quoteOrErr) {
    return { ok: false, error: quoteOrErr.error, status: 503 };
  }

  const resolved = resolveOlcAmount(quoteOrErr.olcAmount, opts.clientOlcAmount);
  if ("error" in resolved) {
    return { ok: false, error: resolved.error, status: 400 };
  }

  return {
    ok: true,
    payment: verified.payment,
    quote: { ...quoteOrErr, olcAmount: resolved.olcAmount },
  };
}

export function inferChainFromAsset(payAsset?: string): PayChain | null {
  const a = (payAsset ?? "").toUpperCase();
  if (a === "BDAG" || a === "BDUSD") return "blockdag";
  if (a === "ETH" || a === "USDT" || a === "USDC") return "ethereum";
  if (a === "BTC") return "bitcoin";
  if (a === "SOL") return "solana";
  return null;
}

export function normalizePayChain(raw?: string): PayChain | null {
  const c = (raw ?? "").toLowerCase().trim();
  if (c === "blockdag" || c === "bdag") return "blockdag";
  if (c === "ethereum" || c === "eth" || c === "mainnet") return "ethereum";
  if (c === "bitcoin" || c === "btc") return "bitcoin";
  if (c === "solana" || c === "sol") return "solana";
  return null;
}

/** Shared in-memory idempotency store (MVP). Document Redis for prod. */
const deliveredByPayment = new Map<
  string,
  { creditTxHash: string; buyer: string; olcAmount: number; at: string; payAsset?: string }
>();

export function getDeliveredByPayment(paymentTxHash: string) {
  return deliveredByPayment.get(paymentTxHash.toLowerCase());
}

export function setDeliveredByPayment(
  paymentTxHash: string,
  row: { creditTxHash: string; buyer: string; olcAmount: number; payAsset?: string },
) {
  deliveredByPayment.set(paymentTxHash.toLowerCase(), {
    ...row,
    at: new Date().toISOString(),
  });
}

export function paymentIdempotencyKey(paymentTxHash: string): string {
  return paymentTxHash.trim().toLowerCase();
}

/** Exported for cron: list known hashes (in-memory only). */
export function hasDeliveredPayment(paymentTxHash: string): boolean {
  return deliveredByPayment.has(paymentTxHash.toLowerCase());
}

export type { Hex };
