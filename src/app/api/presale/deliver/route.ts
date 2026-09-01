import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  fallback,
  getAddress,
  http,
  isAddress,
  parseUnits,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { blockdag } from "@/lib/chain";
import {
  ERC20_ABI_MIN,
  PRESALE_LOCK_ABI,
  getPresaleLockAddress,
  presaleDeliverRpcUrls,
  presaleReadRpcUrls,
} from "@/lib/presaleLock";
import { TOKEN } from "@/lib/token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;
const rateBuckets = new Map<string, number[]>();

/** In-memory idempotency for paymentTxHash → delivery (MVP; use Redis/Postgres in prod). */
const deliveredByPayment = new Map<
  string,
  { creditTxHash: string; buyer: string; olcAmount: number; at: string }
>();

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

function normalizePrivateKey(raw: string): Hex {
  const trimmed = raw.trim();
  const with0x = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(with0x)) {
    throw new Error("PRESALE_DELIVER_PRIVATE_KEY must be a 32-byte hex private key");
  }
  return with0x as Hex;
}

type DeliverBody = {
  buyer?: string;
  olcAmount?: number;
  paymentTxHash?: string;
  batchPriceUsed?: number;
  usdRateUsed?: number;
  usdPaid?: number;
  payAsset?: string;
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
  const olcAmount = typeof body.olcAmount === "number" ? body.olcAmount : Number(body.olcAmount);

  if (!buyerRaw || !isAddress(buyerRaw)) {
    return NextResponse.json({ error: "buyer must be a valid address" }, { status: 400 });
  }
  if (!Number.isFinite(olcAmount) || olcAmount <= 0 || olcAmount > 1e12) {
    return NextResponse.json({ error: "olcAmount must be a positive finite number" }, { status: 400 });
  }
  if (!paymentTxHash || paymentTxHash.length < 10 || paymentTxHash.length > 120) {
    return NextResponse.json({ error: "paymentTxHash is required" }, { status: 400 });
  }

  let buyer: `0x${string}`;
  try {
    buyer = getAddress(buyerRaw);
  } catch {
    return NextResponse.json({ error: "buyer must be a valid checksum address" }, { status: 400 });
  }

  const existing = deliveredByPayment.get(paymentTxHash.toLowerCase());
  if (existing) {
    return NextResponse.json({
      status: "locked" as const,
      creditTxHash: existing.creditTxHash,
      buyer: existing.buyer,
      olcAmount: existing.olcAmount,
      alreadyDelivered: true,
      batchPriceUsed: body.batchPriceUsed,
      usdRateUsed: body.usdRateUsed,
      usdPaid: body.usdPaid,
    });
  }

  const lockAddress = getPresaleLockAddress();
  const pkRaw =
    process.env.PRESALE_DELIVER_PRIVATE_KEY?.trim() ||
    process.env.REWARD_PRIVATE_KEY?.trim();

  if (!lockAddress || !pkRaw) {
    return NextResponse.json(
      {
        status: "locked_pending_chain" as const,
        notConfigured: true,
        message:
          "Presale lock contract or deliver key not configured. Set NEXT_PUBLIC_PRESALE_LOCK_ADDRESS and PRESALE_DELIVER_PRIVATE_KEY (or REWARD_PRIVATE_KEY as operator). OLC is credited locally as locked — not transferable wallet delivery.",
        buyer,
        olcAmount,
        paymentTxHash,
        batchPriceUsed: body.batchPriceUsed,
        usdRateUsed: body.usdRateUsed,
        usdPaid: body.usdPaid,
      },
      { status: 503 },
    );
  }

  let account;
  try {
    account = privateKeyToAccount(normalizePrivateKey(pkRaw));
  } catch (e) {
    return NextResponse.json(
      {
        status: "locked_pending_chain" as const,
        notConfigured: true,
        error: "Invalid PRESALE_DELIVER_PRIVATE_KEY / REWARD_PRIVATE_KEY",
        message: e instanceof Error ? e.message : "Bad private key",
        buyer,
        olcAmount,
      },
      { status: 503 },
    );
  }

  const amountWei = parseUnits(
    // Limit fractional precision to avoid parseUnits overflow on float dust
    Number(olcAmount).toFixed(8).replace(/\.?0+$/, "") || "0",
    TOKEN.decimals,
  );
  if (amountWei <= 0n) {
    return NextResponse.json({ error: "olcAmount too small after decimal conversion" }, { status: 400 });
  }

  // Reads may use engineering/east when west is 502; broadcasts use send-capable only.
  const readUrls = presaleReadRpcUrls();
  const sendUrls = presaleDeliverRpcUrls();
  let lastErr: unknown;
  let creditTxHash: Hex | undefined;
  let mode: "credit" | "transfer_then_credit" | undefined;

  const pc = createPublicClient({
    chain: blockdag,
    transport: fallback(readUrls.map((url) => http(url))),
  });

  for (const sendUrl of sendUrls) {
    try {
      const wc = createWalletClient({
        account,
        chain: blockdag,
        transport: http(sendUrl),
      });

      const [lockBal, totalLocked, operator] = await Promise.all([
        pc.readContract({
          address: TOKEN.contractAddress,
          abi: ERC20_ABI_MIN,
          functionName: "balanceOf",
          args: [lockAddress],
        }),
        pc.readContract({
          address: lockAddress,
          abi: PRESALE_LOCK_ABI,
          functionName: "totalLocked",
        }),
        pc.readContract({
          address: lockAddress,
          abi: PRESALE_LOCK_ABI,
          functionName: "operator",
        }),
      ]);

      const unallocated = lockBal - totalLocked;

      if (unallocated >= amountWei) {
        // Path a: inventory already in lock — operator/owner credit
        creditTxHash = await wc.writeContract({
          address: lockAddress,
          abi: PRESALE_LOCK_ABI,
          functionName: "credit",
          args: [buyer, amountWei],
        });
        mode = "credit";
      } else {
        // Path b: deliver wallet holds OLC — transfer into lock then credit, or creditFrom
        const walletBal = await pc.readContract({
          address: TOKEN.contractAddress,
          abi: ERC20_ABI_MIN,
          functionName: "balanceOf",
          args: [account.address],
        });
        if (walletBal < amountWei) {
          return NextResponse.json(
            {
              status: "locked_pending_chain" as const,
              error: "Insufficient OLC inventory for lock delivery",
              message: `Fund PresaleLock (${lockAddress}) or deliver wallet ${account.address} with OLC. Need ${olcAmount} OLC unallocated.`,
              buyer,
              olcAmount,
            },
            { status: 503 },
          );
        }

        // Prefer creditFrom if this account is operator/owner (single tx after approve)
        const allowance = await pc.readContract({
          address: TOKEN.contractAddress,
          abi: ERC20_ABI_MIN,
          functionName: "allowance",
          args: [account.address, lockAddress],
        });
        if (allowance < amountWei) {
          const approveHash = await wc.writeContract({
            address: TOKEN.contractAddress,
            abi: ERC20_ABI_MIN,
            functionName: "approve",
            args: [lockAddress, amountWei],
          });
          try {
            await pc.waitForTransactionReceipt({ hash: approveHash, timeout: 45_000 });
          } catch {
            /* continue — creditFrom may still work once mined */
          }
        }

        const isOp =
          operator.toLowerCase() === account.address.toLowerCase() ||
          (
            await pc.readContract({
              address: lockAddress,
              abi: PRESALE_LOCK_ABI,
              functionName: "owner",
            })
          ).toLowerCase() === account.address.toLowerCase();

        if (isOp) {
          creditTxHash = await wc.writeContract({
            address: lockAddress,
            abi: PRESALE_LOCK_ABI,
            functionName: "creditFrom",
            args: [account.address, buyer, amountWei],
          });
          mode = "transfer_then_credit";
        } else {
          const transferHash = await wc.writeContract({
            address: TOKEN.contractAddress,
            abi: ERC20_ABI_MIN,
            functionName: "transfer",
            args: [lockAddress, amountWei],
          });
          try {
            await pc.waitForTransactionReceipt({ hash: transferHash, timeout: 45_000 });
          } catch {
            /* */
          }
          return NextResponse.json(
            {
              status: "locked_pending_chain" as const,
              error: "Deliver key is not PresaleLock operator/owner",
              message: `Transferred OLC to lock (${transferHash}) but cannot credit. Call setOperator(${account.address}) or credit manually.`,
              transferTxHash: transferHash,
              buyer,
              olcAmount,
            },
            { status: 503 },
          );
        }
      }

      try {
        await pc.waitForTransactionReceipt({ hash: creditTxHash!, timeout: 45_000 });
      } catch {
        /* hash still valid */
      }
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
      creditTxHash = undefined;
    }
  }

  if (!creditTxHash) {
    const msg = lastErr instanceof Error ? lastErr.message : "Credit failed";
    return NextResponse.json(
      {
        status: "locked_pending_chain" as const,
        error: `PresaleLock credit failed: ${msg}`,
        buyer,
        olcAmount,
      },
      { status: 502 },
    );
  }

  deliveredByPayment.set(paymentTxHash.toLowerCase(), {
    creditTxHash,
    buyer,
    olcAmount,
    at: new Date().toISOString(),
  });

  return NextResponse.json({
    status: "locked" as const,
    creditTxHash,
    buyer,
    olcAmount,
    mode,
    paymentTxHash,
    batchPriceUsed: body.batchPriceUsed,
    usdRateUsed: body.usdRateUsed,
    usdPaid: body.usdPaid,
    payAsset: body.payAsset,
    payAmount: body.payAmount,
    lockAddress,
  });
}
