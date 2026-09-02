/**
 * POST /api/presale/confirm-deposit
 *
 * Verify an external deposit (Ethereum / Bitcoin / Solana) or BlockDAG payment
 * by tx hash, recompute OLC server-side, credit PresaleLock to buyer.
 *
 * Body: { chain, paymentTxHash, buyer, payAsset, olcAmount? }
 */

import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { creditVerifiedPurchase } from "@/lib/presaleCredit";
import {
  getDeliveredByPayment,
  inferChainFromAsset,
  normalizePayChain,
  verifyPaymentAndQuote,
} from "@/lib/verifyPayment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
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

type Body = {
  chain?: string;
  paymentTxHash?: string;
  buyer?: string;
  payAsset?: string;
  olcAmount?: number;
};

export async function POST(req: NextRequest) {
  if (!checkRateLimit(clientIp(req))) {
    return NextResponse.json(
      { error: "Too many confirm attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const buyerRaw = typeof body.buyer === "string" ? body.buyer.trim() : "";
  const paymentTxHash =
    typeof body.paymentTxHash === "string" ? body.paymentTxHash.trim() : "";
  const payAsset =
    typeof body.payAsset === "string" ? body.payAsset.trim().toUpperCase() : undefined;
  const clientOlc =
    typeof body.olcAmount === "number"
      ? body.olcAmount
      : body.olcAmount != null
        ? Number(body.olcAmount)
        : null;

  if (!buyerRaw || !isAddress(buyerRaw)) {
    return NextResponse.json(
      {
        error:
          "buyer must be your connected BlockDAG wallet address (OLC is credited there)",
      },
      { status: 400 },
    );
  }
  if (!paymentTxHash || paymentTxHash.length < 10 || paymentTxHash.length > 128) {
    return NextResponse.json(
      { error: "paymentTxHash is required — paste the tx hash after sending" },
      { status: 400 },
    );
  }

  const chain =
    normalizePayChain(body.chain) ||
    inferChainFromAsset(payAsset);
  if (!chain) {
    return NextResponse.json(
      {
        error:
          "chain is required: ethereum | bitcoin | solana | blockdag (or provide payAsset)",
      },
      { status: 400 },
    );
  }

  const existing = getDeliveredByPayment(paymentTxHash);
  if (existing) {
    return NextResponse.json({
      status: "locked" as const,
      creditTxHash: existing.creditTxHash,
      buyer: existing.buyer,
      olcAmount: existing.olcAmount,
      alreadyDelivered: true,
      paymentTxHash,
      verified: true,
    });
  }

  const verified = await verifyPaymentAndQuote({
    chain,
    paymentTxHash,
    payAsset,
    buyer: chain === "blockdag" ? buyerRaw : undefined,
    clientOlcAmount: clientOlc,
  });

  if (!verified.ok) {
    return NextResponse.json(
      {
        error: verified.error,
        verified: false,
        status: "unverified" as const,
      },
      { status: verified.status ?? 400 },
    );
  }

  const result = await creditVerifiedPurchase({
    buyer: buyerRaw,
    payment: verified.payment,
    quote: verified.quote,
  });

  if (result.status === "locked") {
    return NextResponse.json({
      status: "locked" as const,
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
      rateSource: result.quote.rateSource,
      lockAddress: result.lockAddress,
      verified: true,
    });
  }

  return NextResponse.json(
    {
      status: "locked_pending_chain" as const,
      notConfigured: result.notConfigured,
      error: result.error,
      message: result.message,
      buyer: result.buyer,
      olcAmount: result.olcAmount,
      paymentTxHash: result.payment.paymentTxHash,
      payChain: result.payment.chain,
      payAsset: result.payment.payAsset,
      payAmount: result.payment.payAmount,
      batchPriceUsed: result.quote.batchPriceUsed,
      usdRateUsed: result.quote.usdRateUsed,
      usdPaid: result.quote.usdPaid,
      verified: true,
    },
    { status: result.httpStatus },
  );
}
