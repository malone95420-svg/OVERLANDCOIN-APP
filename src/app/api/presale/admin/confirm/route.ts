/**
 * POST /api/presale/admin/confirm
 *
 * Austin (admin) confirms a past pending non-BlockDAG (or any) purchase by pasting
 * paymentTxHash + buyer BlockDAG wallet, then reuses verifyPaymentAndQuote +
 * creditVerifiedPurchase so OLC ERC-20 is delivered the same as normal flow.
 *
 * Auth (required): Authorization: Bearer <PRESALE_ADMIN_SECRET>
 *               or x-presale-admin-secret: <PRESALE_ADMIN_SECRET>
 *
 * Body: { paymentTxHash, buyer, payAsset, payAmount?, force?, olcAmount? }
 * force: true — only when on-chain verify fails (e.g. flaky BTC explorer); still
 * requires admin secret + explicit payAmount. Prefer verify-first.
 *
 * GET — list Redis recent-buys (full buyer) for ops context. There is NO durable
 * pending-purchase DB on serverless; admin confirms by pasting tx + buyer.
 */

import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { creditVerifiedPurchase } from "@/lib/presaleCredit";
import { friendlyPaymentError, parsePaymentTxRef } from "@/lib/parsePaymentTxRef";
import { listAdminRecentBuys } from "@/lib/recentBuys";
import {
  computeOlcQuote,
  getDeliveredByPayment,
  inferChainFromAsset,
  normalizePayChain,
  verifyPaymentAndQuote,
  type PayAssetId,
  type VerifiedPayment,
} from "@/lib/verifyPayment";
import { fetchAllLivePrices } from "@/lib/livePrices";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_ASSETS: PayAssetId[] = [
  "ETH",
  "USDT",
  "USDC",
  "SOL",
  "BTC",
  "BDAG",
  "BDUSD",
];

function adminSecretConfigured(): string | null {
  const s = process.env.PRESALE_ADMIN_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

function extractPresentedSecret(req: NextRequest): string {
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (/^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }
  return req.headers.get("x-presale-admin-secret")?.trim() ?? "";
}

function requireAdmin(req: NextRequest): NextResponse | null {
  const expected = adminSecretConfigured();
  if (!expected) {
    return NextResponse.json(
      {
        error:
          "PRESALE_ADMIN_SECRET is not configured on the server. Set it in Vercel env and redeploy.",
      },
      { status: 503 },
    );
  }
  const presented = extractPresentedSecret(req);
  if (!presented || presented !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

type ConfirmBody = {
  paymentTxHash?: string;
  buyer?: string;
  payAsset?: string;
  payAmount?: number | string;
  olcAmount?: number | string;
  force?: boolean;
  chain?: string;
};

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const raw = req.nextUrl.searchParams.get("limit");
  const limit = raw ? Number(raw) : 40;
  const { buys, durable, limit: n } = await listAdminRecentBuys(limit);

  return NextResponse.json({
    recentBuys: buys,
    recentBuysDurable: durable,
    recentBuysLimit: n,
    pendingQueue: null,
    note:
      "There is no durable pending-purchase database on Vercel. Admin confirms past deposits by pasting paymentTxHash + buyer BlockDAG wallet on POST. recentBuys is Redis (or memory) of already-delivered purchases for ops context — not a pending queue.",
  });
}

export async function POST(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  let body: ConfirmBody;
  try {
    body = (await req.json()) as ConfirmBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const buyerRaw = typeof body.buyer === "string" ? body.buyer.trim() : "";
  const paymentTxHash = parsePaymentTxRef(
    typeof body.paymentTxHash === "string" ? body.paymentTxHash : "",
  );
  const payAssetRaw =
    typeof body.payAsset === "string" ? body.payAsset.trim().toUpperCase() : "";
  const force = body.force === true;
  const clientOlc =
    typeof body.olcAmount === "number"
      ? body.olcAmount
      : body.olcAmount != null
        ? Number(body.olcAmount)
        : null;
  const payAmountRaw =
    typeof body.payAmount === "number"
      ? body.payAmount
      : body.payAmount != null
        ? Number(String(body.payAmount).replace(/,/g, ""))
        : NaN;

  if (!buyerRaw || !isAddress(buyerRaw)) {
    return NextResponse.json(
      {
        error:
          "buyer must be the BlockDAG wallet address that should receive OLC (0x…)",
      },
      { status: 400 },
    );
  }

  if (!paymentTxHash || paymentTxHash.length < 10 || paymentTxHash.length > 128) {
    return NextResponse.json(
      {
        error:
          "paymentTxHash is required — paste the payment tx hash or explorer URL",
      },
      { status: 400 },
    );
  }

  if (!ADMIN_ASSETS.includes(payAssetRaw as PayAssetId)) {
    return NextResponse.json(
      {
        error: `payAsset required: ${ADMIN_ASSETS.join(" | ")}`,
      },
      { status: 400 },
    );
  }
  const payAsset = payAssetRaw as PayAssetId;

  const chain =
    normalizePayChain(body.chain) || inferChainFromAsset(payAsset);
  if (!chain) {
    return NextResponse.json(
      { error: "Could not infer chain from payAsset" },
      { status: 400 },
    );
  }

  const existing = getDeliveredByPayment(paymentTxHash);
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
      forced: false,
    });
  }

  // Prefer on-chain / explorer verify
  const verified = await verifyPaymentAndQuote({
    chain,
    paymentTxHash,
    payAsset,
    buyer: chain === "blockdag" ? buyerRaw : undefined,
    clientOlcAmount: clientOlc,
  });

  if (verified.ok) {
    // Optional: if admin also sent payAmount, soft-check it doesn't wildly disagree
    if (Number.isFinite(payAmountRaw) && payAmountRaw > 0) {
      const onChain = verified.payment.payAmount;
      const drift = Math.abs(onChain - payAmountRaw) / Math.max(onChain, payAmountRaw);
      if (drift > 0.05) {
        return NextResponse.json(
          {
            error: `payAmount hint ${payAmountRaw} differs from verified on-chain amount ${onChain} by >5%. Omit payAmount or fix it; do not force unless intentional.`,
            verifiedAmount: onChain,
            hintAmount: payAmountRaw,
            verified: true,
            status: "amount_mismatch" as const,
          },
          { status: 409 },
        );
      }
    }

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
          error: friendlyPaymentError(result.error || result.message),
          message: result.message,
          buyer: result.buyer,
          olcAmount: result.olcAmount,
          paymentTxHash: result.payment.paymentTxHash,
          payChain: result.payment.chain,
          payAsset: result.payment.payAsset,
          payAmount: result.payment.payAmount,
          deliverWallet: result.deliverWallet,
          inventoryOlC: result.inventoryOlC,
          verified: true,
          forced: false,
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
      alreadyDelivered: result.alreadyDelivered ?? false,
      paymentTxHash: result.payment.paymentTxHash,
      payChain: result.payment.chain,
      payAsset: result.payment.payAsset,
      payAmount: result.payment.payAmount,
      batchPriceUsed: result.quote.batchPriceUsed,
      usdRateUsed: result.quote.usdRateUsed,
      usdPaid: result.quote.usdPaid,
      rateSource: result.quote.rateSource,
      deliverWallet: result.deliverWallet,
      verified: true,
      forced: false,
    });
  }

  // Verify failed — only force with explicit admin flag + payAmount (e.g. BTC explorer flaky)
  if (!force) {
    return NextResponse.json(
      {
        error: friendlyPaymentError(verified.error),
        detail: verified.error,
        verified: false,
        status: "unverified" as const,
        hint:
          payAsset === "BTC"
            ? "BTC verify can be flaky. Re-check the txid, or retry with force: true + payAmount (BTC human units) — clearly labeled admin override."
            : "Fix the tx / asset / network, or retry. force: true + payAmount is an admin override when verify is unreliable.",
      },
      { status: verified.status ?? 400 },
    );
  }

  if (!Number.isFinite(payAmountRaw) || !(payAmountRaw > 0)) {
    return NextResponse.json(
      {
        error:
          "force: true requires payAmount (human units of the pay asset) because on-chain verify failed",
        detail: verified.error,
        verified: false,
      },
      { status: 400 },
    );
  }

  const prices = await fetchAllLivePrices();
  const quoteOrErr = computeOlcQuote(payAsset, payAmountRaw, prices);
  if ("error" in quoteOrErr) {
    return NextResponse.json(
      { error: quoteOrErr.error, verified: false, forced: true },
      { status: 503 },
    );
  }

  let olcAmount = quoteOrErr.olcAmount;
  if (
    clientOlc != null &&
    Number.isFinite(clientOlc) &&
    clientOlc > 0 &&
    clientOlc <= olcAmount
  ) {
    olcAmount = clientOlc;
  }

  const forcedPayment: VerifiedPayment = {
    chain,
    payAsset,
    paymentTxHash:
      chain === "bitcoin"
        ? paymentTxHash.replace(/^0x/i, "").toLowerCase()
        : chain === "ethereum" || chain === "blockdag"
          ? paymentTxHash.toLowerCase()
          : paymentTxHash,
    payAmount: payAmountRaw,
    treasuryTo: "admin-force",
  };

  const result = await creditVerifiedPurchase({
    buyer: buyerRaw,
    payment: forcedPayment,
    quote: { ...quoteOrErr, olcAmount },
  });

  if (result.status === "locked_pending_chain") {
    return NextResponse.json(
      {
        status: "locked_pending_chain" as const,
        notConfigured: result.notConfigured,
        error: friendlyPaymentError(result.error || result.message),
        message: result.message,
        buyer: result.buyer,
        olcAmount: result.olcAmount,
        paymentTxHash: result.payment.paymentTxHash,
        payChain: result.payment.chain,
        payAsset: result.payment.payAsset,
        payAmount: result.payment.payAmount,
        deliverWallet: result.deliverWallet,
        inventoryOlC: result.inventoryOlC,
        verified: false,
        forced: true,
        forceReason: verified.error,
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
    alreadyDelivered: result.alreadyDelivered ?? false,
    paymentTxHash: result.payment.paymentTxHash,
    payChain: result.payment.chain,
    payAsset: result.payment.payAsset,
    payAmount: result.payment.payAmount,
    batchPriceUsed: result.quote.batchPriceUsed,
    usdRateUsed: result.quote.usdRateUsed,
    usdPaid: result.quote.usdPaid,
    rateSource: result.quote.rateSource,
    deliverWallet: result.deliverWallet,
    verified: false,
    forced: true,
    forceReason: verified.error,
    warning:
      "Delivered with admin force override (on-chain verify failed). Confirm payAmount manually.",
  });
}
