/**
 * Public recent presale buys feed.
 * Durable on Upstash Redis when UPSTASH_REDIS_REST_URL + TOKEN are set.
 * Otherwise in-memory (lost on cold start / multi-instance — clear limitation).
 */

import { Redis } from "@upstash/redis";
import { hasUpstashRedis } from "@/lib/auth/userStore";

export type PublicRecentBuy = {
  id: string;
  /** Checksummed or lowercased buyer; UI masks this */
  buyer: string;
  olcAmount: number;
  payAsset: string;
  /** Unix ms */
  ts: number;
  paymentTxHash?: string;
  deliveryTxHash?: string;
};

const REDIS_KEY = "olc:presale:recent-buys";
const MAX_ITEMS = 50;

const memory: PublicRecentBuy[] = [];

function redisClient(): Redis | null {
  if (!hasUpstashRedis()) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

function maskBuyer(buyer: string): string {
  const a = buyer.trim();
  if (a.length < 10) return "0x…";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function normalizeBuy(input: {
  buyer: string;
  olcAmount: number;
  payAsset: string;
  ts?: number;
  paymentTxHash?: string;
  deliveryTxHash?: string;
}): PublicRecentBuy | null {
  const buyer = typeof input.buyer === "string" ? input.buyer.trim() : "";
  const olcAmount = Number(input.olcAmount);
  const payAsset =
    typeof input.payAsset === "string" ? input.payAsset.trim().toUpperCase() : "";
  if (!buyer || !/^0x[a-fA-F0-9]{40}$/i.test(buyer)) return null;
  if (!Number.isFinite(olcAmount) || olcAmount <= 0) return null;
  if (!payAsset || payAsset.length > 16) return null;

  const paymentTxHash =
    typeof input.paymentTxHash === "string" && input.paymentTxHash.length >= 10
      ? input.paymentTxHash.trim().slice(0, 128)
      : undefined;
  const deliveryTxHash =
    typeof input.deliveryTxHash === "string" && input.deliveryTxHash.length >= 10
      ? input.deliveryTxHash.trim().slice(0, 128)
      : undefined;

  const ts =
    typeof input.ts === "number" && Number.isFinite(input.ts) && input.ts > 0
      ? input.ts
      : Date.now();

  const id = `${paymentTxHash || deliveryTxHash || buyer}-${ts}-${Math.round(olcAmount * 1e6)}`;

  return {
    id,
    buyer,
    olcAmount,
    payAsset,
    ts,
    paymentTxHash,
    deliveryTxHash,
  };
}

/** Append after successful OLC delivery. Best-effort — never throws to callers. */
export async function appendPublicRecentBuy(input: {
  buyer: string;
  olcAmount: number;
  payAsset: string;
  paymentTxHash?: string;
  deliveryTxHash?: string;
  ts?: number;
}): Promise<void> {
  try {
    const row = normalizeBuy(input);
    if (!row) return;

    const r = redisClient();
    if (r) {
      // Deduplicate by paymentTxHash when present
      if (row.paymentTxHash) {
        const existing = await r.lrange<PublicRecentBuy>(REDIS_KEY, 0, MAX_ITEMS - 1);
        if (
          Array.isArray(existing) &&
          existing.some(
            (e) =>
              e &&
              typeof e === "object" &&
              (e as PublicRecentBuy).paymentTxHash === row.paymentTxHash,
          )
        ) {
          return;
        }
      }
      await r.lpush(REDIS_KEY, row);
      await r.ltrim(REDIS_KEY, 0, MAX_ITEMS - 1);
      return;
    }

    if (row.paymentTxHash && memory.some((e) => e.paymentTxHash === row.paymentTxHash)) {
      return;
    }
    memory.unshift(row);
    if (memory.length > MAX_ITEMS) memory.length = MAX_ITEMS;
  } catch (e) {
    console.warn("[recentBuys] append failed", e instanceof Error ? e.message : e);
  }
}

export async function listPublicRecentBuys(limit = 30): Promise<{
  buys: Array<PublicRecentBuy & { buyerMasked: string }>;
  durable: boolean;
  limit: number;
}> {
  const n = Math.min(Math.max(1, Math.floor(limit) || 30), MAX_ITEMS);
  const durable = hasUpstashRedis();

  try {
    const r = redisClient();
    let rows: PublicRecentBuy[] = [];
    if (r) {
      const raw = await r.lrange(REDIS_KEY, 0, n - 1);
      rows = (Array.isArray(raw) ? raw : [])
        .map((item) => {
          if (!item) return null;
          if (typeof item === "string") {
            try {
              return JSON.parse(item) as PublicRecentBuy;
            } catch {
              return null;
            }
          }
          return item as PublicRecentBuy;
        })
        .filter((b): b is PublicRecentBuy => Boolean(b));
    } else {
      rows = memory.slice(0, n);
    }

    const buys = rows
      .filter(
        (b) =>
          b &&
          typeof b.buyer === "string" &&
          typeof b.olcAmount === "number" &&
          typeof b.ts === "number",
      )
      .map((b) => ({
        ...b,
        buyerMasked: maskBuyer(b.buyer),
        // Do not leak full buyer in public JSON
        buyer: maskBuyer(b.buyer),
      }));

    return { buys, durable, limit: n };
  } catch (e) {
    console.warn("[recentBuys] list failed", e instanceof Error ? e.message : e);
    return { buys: [], durable, limit: n };
  }
}

export { maskBuyer };
