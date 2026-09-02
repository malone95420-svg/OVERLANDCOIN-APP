/**
 * POST /api/presale/orders/:id/confirm
 *
 * Verify payment for a Pay Order and credit PresaleLock to order.buyer.
 *
 * Body (optional): { paymentTxHash? } — bare hash or explorer URL.
 * If omitted, server scans recent deposits to the order deposit address for
 * an amount matching order.payAmount (± tolerance) after order.createdAt.
 *
 * Never credits without verified on-chain / BTC payment. Idempotent by payment tx id.
 */

import { NextRequest, NextResponse } from "next/server";
import { creditVerifiedPurchase } from "@/lib/presaleCredit";
import { findDepositForOrder } from "@/lib/findDepositPayment";
import { friendlyPaymentError, parsePaymentTxRef } from "@/lib/parsePaymentTxRef";
import {
  amountsMatch,
  getOrder,
  markOrderCredited,
  markOrderPaid,
} from "@/lib/presaleOrders";
import {
  getDeliveredByPayment,
  verifyPaymentAndQuote,
} from "@/lib/verifyPayment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;
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

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!checkRateLimit(clientIp(req))) {
    return NextResponse.json(
      { error: "Too many confirm attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  const { id: orderId } = await ctx.params;
  if (!orderId || orderId.length < 8) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const order = getOrder(orderId);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (order.status === "credited" && order.creditTxHash && order.paymentTxHash) {
    return NextResponse.json({
      status: "locked" as const,
      orderId: order.orderId,
      creditTxHash: order.creditTxHash,
      buyer: order.buyer,
      olcAmount: order.olcAmount,
      paymentTxHash: order.paymentTxHash,
      alreadyDelivered: true,
      verified: true,
    });
  }

  if (order.status === "expired" || Date.now() > order.expiresAt) {
    return NextResponse.json(
      {
        error: "This pay order expired — create a new Buy order with a fresh quote.",
        status: "expired" as const,
        orderId: order.orderId,
      },
      { status: 410 },
    );
  }

  let body: { paymentTxHash?: string } = {};
  try {
    const text = await req.text();
    if (text.trim()) body = JSON.parse(text) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pasted = parsePaymentTxRef(
    typeof body.paymentTxHash === "string" ? body.paymentTxHash : "",
  );

  let paymentTxHash = pasted;

  if (!paymentTxHash) {
    const found = await findDepositForOrder(order);
    if (!found) {
      return NextResponse.json(
        {
          error: "No matching payment found yet — wait a minute and try again.",
          verified: false,
          status: "unverified" as const,
          orderId: order.orderId,
          hint: `Looking for ~${order.payAmount} ${order.payAsset} to ${order.depositAddress} since order creation.`,
        },
        { status: 404 },
      );
    }
    paymentTxHash = found.paymentTxHash;
  }

  // Idempotent short-circuit
  const existing = getDeliveredByPayment(paymentTxHash);
  if (existing) {
    markOrderCredited(order.orderId, {
      paymentTxHash,
      creditTxHash: existing.creditTxHash,
      olcAmount: existing.olcAmount,
    });
    return NextResponse.json({
      status: "locked" as const,
      orderId: order.orderId,
      creditTxHash: existing.creditTxHash,
      buyer: existing.buyer,
      olcAmount: existing.olcAmount,
      paymentTxHash,
      alreadyDelivered: true,
      verified: true,
    });
  }

  const verified = await verifyPaymentAndQuote({
    chain: order.payChain,
    paymentTxHash,
    payAsset: order.payAsset,
    buyer: order.payChain === "blockdag" ? order.buyer : undefined,
    clientOlcAmount: order.olcAmount,
  });

  if (!verified.ok) {
    return NextResponse.json(
      {
        error: friendlyPaymentError(verified.error),
        detail: verified.error,
        verified: false,
        status: "unverified" as const,
        orderId: order.orderId,
      },
      { status: verified.status ?? 400 },
    );
  }

  // Must match this order's quoted amount (± tolerance)
  if (!amountsMatch(order.payAsset, order.payAmount, verified.payment.payAmount)) {
    return NextResponse.json(
      {
        error: `Payment amount ${verified.payment.payAmount} ${order.payAsset} does not match this order’s ${order.payAmount} ${order.payAsset}. Create a new order if you sent a different amount.`,
        verified: true,
        status: "amount_mismatch" as const,
        orderId: order.orderId,
        paymentTxHash: verified.payment.paymentTxHash,
        payAmount: verified.payment.payAmount,
        expectedPayAmount: order.payAmount,
      },
      { status: 409 },
    );
  }

  // Prefer locked order quote (never over-credit vs order)
  const quote = {
    ...verified.quote,
    olcAmount: Math.min(verified.quote.olcAmount, order.olcAmount),
  };

  markOrderPaid(order.orderId, verified.payment.paymentTxHash);

  const result = await creditVerifiedPurchase({
    buyer: order.buyer,
    payment: verified.payment,
    quote,
  });

  if (result.status === "locked") {
    markOrderCredited(order.orderId, {
      paymentTxHash: result.payment.paymentTxHash,
      creditTxHash: result.creditTxHash,
      olcAmount: result.olcAmount,
    });
    return NextResponse.json({
      status: "locked" as const,
      orderId: order.orderId,
      creditTxHash: result.creditTxHash,
      buyer: result.buyer,
      olcAmount: result.olcAmount,
      mode: result.mode,
      alreadyDelivered: result.alreadyDelivered,
      paymentTxHash: result.payment.paymentTxHash,
      payChain: result.payment.chain,
      payAsset: result.payment.payAsset,
      payAmount: result.payment.payAmount,
      batchPriceUsed: result.quote.batchPriceUsed,
      usdRateUsed: result.quote.usdRateUsed,
      usdPaid: result.quote.usdPaid,
      lockAddress: result.lockAddress,
      verified: true,
    });
  }

  return NextResponse.json(
    {
      status: "locked_pending_chain" as const,
      orderId: order.orderId,
      notConfigured: result.notConfigured,
      error: friendlyPaymentError(result.error || result.message),
      message: result.message,
      buyer: result.buyer,
      olcAmount: result.olcAmount,
      paymentTxHash: result.payment.paymentTxHash,
      payAsset: result.payment.payAsset,
      payAmount: result.payment.payAmount,
      verified: true,
    },
    { status: result.httpStatus },
  );
}
