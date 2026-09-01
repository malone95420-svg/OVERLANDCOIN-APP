import { NextResponse } from "next/server";
import { fetchAllLivePrices, type LivePricesResponse } from "@/lib/livePrices";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 60_000;

type CacheEntry = {
  body: LivePricesResponse;
  expiresAt: number;
};

let cache: CacheEntry | null = null;

export async function GET() {
  const now = Date.now();

  if (cache && cache.expiresAt > now) {
    return NextResponse.json(cache.body, {
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    });
  }

  try {
    const body = await fetchAllLivePrices();
    // Cache successful BDAG quotes; still cache partials briefly so we don't hammer APIs
    cache = { body, expiresAt: now + CACHE_TTL_MS };
    const status = body.bdagUsd == null ? 502 : 200;
    return NextResponse.json(body, {
      status,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=30",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Price fetch failed";
    const body: LivePricesResponse = {
      bdagUsd: null,
      usdtUsd: 1,
      usdcUsd: 1,
      bdusdUsd: 1,
      ethUsd: null,
      btcUsd: null,
      solUsd: null,
      bnbUsd: null,
      source: null,
      sources: { usdt: "peg", usdc: "peg", bdusd: "peg" },
      updatedAt: Date.now(),
      error: message,
    };
    return NextResponse.json(body, { status: 502 });
  }
}
