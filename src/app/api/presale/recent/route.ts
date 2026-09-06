/**
 * GET /api/presale/recent
 * Public feed of recent successful OLC deliveries (newest first).
 */

import { NextRequest, NextResponse } from "next/server";
import { listPublicRecentBuys } from "@/lib/recentBuys";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("limit");
  const limit = raw ? Number(raw) : 30;
  const { buys, durable, limit: n } = await listPublicRecentBuys(limit);

  return NextResponse.json(
    {
      buys,
      count: buys.length,
      durable,
      limit: n,
      storage: durable ? "upstash" : "memory",
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
      },
    },
  );
}
