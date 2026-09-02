/**
 * POST /api/presale/orders
 * Create a Pay Order for external deposit assets (SOL/ETH/USDT/USDC/BTC).
 *
 * Body: { buyer, payAsset, olcAmount? | payAmount? }
 *
 * GET /api/presale/orders?buyer=0x… — recent orders for buyer (optional helper)
 *
 * Storage: in-memory + /tmp MVP (see presaleOrders.ts). Use Redis in prod.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { createPayOrder, listOrdersForBuyer } from "@/lib/presaleOrders";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 20;
const rateBuckets = new Map<string, number[]>();

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const prev = rateBuckets.get(ip) ?? [];
  const recent = prev.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(ip, recent);
    return false;
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  return true;
}

export async function POST(req: NextRequest) {
  if (!checkRateLimit(clientIp(req))) {
    return NextResponse.json(
      { error: "Too many orders. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let body: {
    buyer?: string;
    payAsset?: string;
    olcAmount?: number;
    payAmount?: number;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await createPayOrder({
    buyer: body.buyer ?? "",
    payAsset: body.payAsset ?? "",
    olcAmount: body.olcAmount,
    payAmount: body.payAmount,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    );
  }

  const o = result.order;
  return NextResponse.json({
    orderId: o.orderId,
    buyer: o.buyer,
    payAsset: o.payAsset,
    payChain: o.payChain,
    payAmount: o.payAmount,
    olcAmount: o.olcAmount,
    usdPaid: o.usdPaid,
    batchPriceUsed: o.batchPriceUsed,
    usdRateUsed: o.usdRateUsed,
    rateSource: o.rateSource,
    depositAddress: o.depositAddress,
    depositNetwork: o.depositNetwork,
    status: o.status,
    createdAt: o.createdAt,
    expiresAt: o.expiresAt,
    // Hint for clients
    safety:
      "OLC only credits after we see your payment on-chain. Wrong network = lost funds.",
  });
}

export async function GET(req: NextRequest) {
  const buyer = req.nextUrl.searchParams.get("buyer")?.trim() ?? "";
  if (!buyer || !isAddress(buyer)) {
    return NextResponse.json(
      { error: "buyer query param must be a valid address" },
      { status: 400 },
    );
  }
  const orders = listOrdersForBuyer(buyer, 15).map((o) => ({
    orderId: o.orderId,
    payAsset: o.payAsset,
    payAmount: o.payAmount,
    olcAmount: o.olcAmount,
    status: o.status,
    depositAddress: o.depositAddress,
    expiresAt: o.expiresAt,
    paymentTxHash: o.paymentTxHash,
    creditTxHash: o.creditTxHash,
    createdAt: o.createdAt,
  }));
  return NextResponse.json({ orders });
}
