/**
 * GET /api/presale/stats
 * Public live Batch 1 remaining OLC (sold = delivered credits).
 */

import { NextResponse } from "next/server";
import { livePresaleBatch } from "@/lib/site";
import { getTotalDeliveredOlc } from "@/lib/verifyPayment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const batch = livePresaleBatch();
  const soldRaw = await getTotalDeliveredOlc();
  const soldOlC = Number.isFinite(soldRaw) && soldRaw > 0 ? soldRaw : 0;
  const allocationOlC = batch.allocationOlC;
  const remainingOlC = Math.max(0, allocationOlC - soldOlC);
  const pctSold = allocationOlC > 0 ? Math.min(100, (soldOlC / allocationOlC) * 100) : 0;

  return NextResponse.json(
    {
      batch: batch.batch,
      status: batch.status,
      priceUsdt: batch.priceUsdt,
      allocationOlC,
      soldOlC,
      remainingOlC,
      pctSold,
      updatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
