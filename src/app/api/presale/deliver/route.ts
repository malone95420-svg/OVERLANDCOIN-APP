/**
 * POST /api/presale/deliver
 *
 * After on-chain / network payment verification, transfers OLC ERC-20 to the buyer wallet.
 * Never trusts client olcAmount alone — recomputes from verified pay amount × live USD ÷ batch price.
 * Idempotent by paymentTxHash (in-memory MVP; use Redis/Postgres in prod).
 *
 * Body:
 *   buyer            — BlockDAG EVM address to credit (required)
 *   paymentTxHash    — payment tx id / signature (required)
 *   payChain?        — blockdag | ethereum | bitcoin | solana (inferred from payAsset if omitted)
 *   payAsset?        — BDAG | BDUSD | ETH | USDT | USDC | BTC | SOL
 *   olcAmount?       — client hint; capped to verified; rejected if >1% over computed
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

type DeliverBody = {
  buyer?: string;
  olcAmount?: number;
  paymentTxHash?: string;
  payChain?: string;
  payAsset?: string;
  batchPriceUsed?: number;
  usdRateUsed?: number;
  usdPaid?: number;
  payAmount?: string;
};

export async function POST(req: NextRequest) {
  if (!checkRateLimit(clientIp(req))) {
    return NextResponse.json(
      { error: "Too many deliver attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let body: DeliverBody;
  try {
    body = (await req.json()) as DeliverBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const buyerRaw = typeof body.buyer === "string" ? body.buyer.trim() : "";
  const paymentTxHash =
    typeof body.paymentTxHash === "string" ? body.paymentTxHash.trim() : "";
  const clientOlc =
    typeof body.olcAmount === "number"
      ? body.olcAmount
      : body.olcAmount != null
        ? Number(body.olcAmount)
        : null;
  const payAsset =
    typeof body.payAsset === "string" ? body.payAsset.trim().toUpperCase() : undefined;

  if (!buyerRaw || !isAddress(buyerRaw)) {
    return NextResponse.json(
      { error: "buyer must be a valid BlockDAG / EVM address to credit" },
      { status: 400 },
    );
  }
  if (!paymentTxHash || paymentTxHash.length < 10 || paymentTxHash.length > 128) {
    return NextResponse.json(
      { error: "paymentTxHash is required (on-chain tx hash or network tx id)" },
      { status: 400 },
    );
  }

  // Idempotent short-circuit before RPC work
  const existing = await getDeliveredByPayment(paymentTxHash);
  if (existing) {
    return NextResponse.json({
      status: "delivered" as const,
      creditTxHash: existing.creditTxHash,
      buyer: existing.buyer,
      olcAmount: existing.olcAmount,
      alreadyDelivered: true,
      mode: "wallet_transfer" as const,
      paymentTxHash,
      payAsset: existing.payAsset ?? payAsset,
      verified: true,
    });
  }

  const chain =
    normalizePayChain(body.payChain) ||
    inferChainFromAsset(payAsset) ||
    "blockdag";

  const verified = await verifyPaymentAndQuote({
    chain,
    paymentTxHash,
    payAsset,
    buyer: buyerRaw,
    clientOlcAmount: clientOlc,
  });

  if (!verified.ok) {
    const pending = (verified.status ?? 400) === 409;
    return NextResponse.json(
      {
        error: verified.error,
        verified: false,
        status: pending ? ("pending_confirmation" as const) : ("unverified" as const),
        retryable: pending,
      },
      { status: verified.status ?? 400 },
    );
  }

  // For BlockDAG native/BDUSD we already enforced from===buyer inside verify.
  // For external chains, buyer is the connected BlockDAG wallet to credit.
  const result = await creditVerifiedPurchase({
    buyer: buyerRaw,
    payment: verified.payment,
    quote: verified.quote,
  });

  if (result.status === "locked_pending_chain") {
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
        transferTxHash: result.transferTxHash,
        deliverWallet: result.deliverWallet,
        inventoryOlC: result.inventoryOlC,
        verified: true,
      },
      { status: result.httpStatus },
    );
  }

  return NextResponse.json({
    status: "delivered" as const,
    creditTxHash: result.creditTxHash,
    buyer: result.buyer,
    olcAmount: result.olcAmount,
    mode: result.mode ?? "wallet_transfer",
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
    deliverWallet: result.deliverWallet,
    verified: true,
  });
}
