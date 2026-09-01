import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  isAddress,
  parseUnits,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { blockdag } from "@/lib/chain";
import { getClaim, isCompletionClaimed, recordClaim } from "@/lib/claimsLedger";
import { getQuestById } from "@/lib/quests";
import { TOKEN } from "@/lib/token";
import { blockdagHttpRpcUrls, isKnownGoodBlockdagRpc } from "@/lib/blockdagRpc";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Light per-IP rate limit: max N claims per window. */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 8;
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

function normalizePrivateKey(raw: string): Hex {
  const trimmed = raw.trim();
  const with0x = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(with0x)) {
    throw new Error("REWARD_PRIVATE_KEY must be a 32-byte hex private key");
  }
  return with0x as Hex;
}

function rpcUrls(): string[] {
  const envRpc = process.env.REWARD_RPC_URL?.trim();
  const list = [
    envRpc && isKnownGoodBlockdagRpc(envRpc) ? envRpc : undefined,
    ...blockdagHttpRpcUrls(),
  ].filter((u): u is string => Boolean(u));
  return [...new Set(list)];
}

type ClaimBody = {
  completionId?: string;
  questId?: string;
  wallet?: string;
  olcEarned?: number;
  completedAt?: string;
  lat?: number;
  lng?: number;
  distanceM?: number;
  photoHash?: string;
  /** Ignored if present — amount always comes from quest catalog. */
  amount?: number;
};

export async function POST(req: NextRequest) {
  if (!checkRateLimit(clientIp(req))) {
    return NextResponse.json(
      { error: "Too many claim attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let body: ClaimBody;
  try {
    body = (await req.json()) as ClaimBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const completionId = typeof body.completionId === "string" ? body.completionId.trim() : "";
  const questId = typeof body.questId === "string" ? body.questId.trim() : "";
  const walletRaw = typeof body.wallet === "string" ? body.wallet.trim() : "";

  if (!completionId || completionId.length > 80) {
    return NextResponse.json({ error: "completionId is required" }, { status: 400 });
  }
  if (!questId) {
    return NextResponse.json({ error: "questId is required" }, { status: 400 });
  }
  if (!walletRaw || !isAddress(walletRaw)) {
    return NextResponse.json({ error: "wallet must be a valid checksum address" }, { status: 400 });
  }

  let wallet: `0x${string}`;
  try {
    wallet = getAddress(walletRaw);
  } catch {
    return NextResponse.json({ error: "wallet must be a valid checksum address" }, { status: 400 });
  }

  const quest = getQuestById(questId);
  if (!quest) {
    return NextResponse.json({ error: "Unknown questId" }, { status: 400 });
  }

  const amount = quest.rewardOlC;
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Quest has no claimable reward" }, { status: 400 });
  }

  // Client may echo olcEarned — must match catalog (difficulty schedule), never trust arbitrary amount.
  if (body.olcEarned != null && Number(body.olcEarned) !== amount) {
    return NextResponse.json(
      {
        error: `olcEarned mismatch: expected ${amount} OLC for this quest difficulty, got ${body.olcEarned}`,
      },
      { status: 400 },
    );
  }
  if (body.amount != null && Number(body.amount) !== amount) {
    return NextResponse.json(
      { error: "Client amount ignored; does not match quest reward schedule" },
      { status: 400 },
    );
  }

  // Basic completion payload sanity (client-attested MVP; production needs signed server attestations).
  if (body.lat != null && body.lng != null) {
    if (!Number.isFinite(body.lat) || !Number.isFinite(body.lng)) {
      return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 });
    }
    const dist = typeof body.distanceM === "number" ? body.distanceM : NaN;
    if (Number.isFinite(dist) && dist > quest.radiusMeters * 3) {
      return NextResponse.json(
        { error: "distanceM far outside quest radius — refusing claim" },
        { status: 400 },
      );
    }
  }

  if (await isCompletionClaimed(completionId)) {
    const existing = await getClaim(completionId);
    return NextResponse.json(
      {
        error: "Already claimed",
        txHash: existing?.txHash,
        amount: existing?.amount,
        status: "claimed",
      },
      { status: 409 },
    );
  }

  const pkRaw = process.env.REWARD_PRIVATE_KEY?.trim();
  if (!pkRaw) {
    return NextResponse.json(
      {
        error: "Rewards wallet is not configured",
        message:
          "Set REWARD_PRIVATE_KEY (and optionally REWARD_RPC_URL) on the server, then fund that wallet with OLC. UI works in demo mode until then — no fake on-chain success.",
        notConfigured: true,
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
        error: "Invalid REWARD_PRIVATE_KEY",
        message: e instanceof Error ? e.message : "Bad private key",
        notConfigured: true,
      },
      { status: 503 },
    );
  }

  const urls = rpcUrls();
  const amountWei = parseUnits(String(amount), TOKEN.decimals);

  let lastErr: unknown;
  let txHash: Hex | undefined;

  for (const url of urls) {
    try {
      const pc = createPublicClient({ chain: blockdag, transport: http(url) });
      const wc = createWalletClient({
        account,
        chain: blockdag,
        transport: http(url),
      });

      const bal = await pc.readContract({
        address: TOKEN.contractAddress,
        abi: ERC20_TRANSFER_ABI,
        functionName: "balanceOf",
        args: [account.address],
      });
      if (bal < amountWei) {
        return NextResponse.json(
          {
            error: "Rewards wallet has insufficient OLC balance",
            message: `Fund ${account.address} with OLC on BlockDAG before claiming.`,
          },
          { status: 503 },
        );
      }

      txHash = await wc.writeContract({
        address: TOKEN.contractAddress,
        abi: ERC20_TRANSFER_ABI,
        functionName: "transfer",
        args: [wallet, amountWei],
      });

      try {
        await pc.waitForTransactionReceipt({ hash: txHash, timeout: 45_000 });
      } catch {
        /* hash is still valid to show in explorer */
      }
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
    }
  }

  if (!txHash) {
    const msg = lastErr instanceof Error ? lastErr.message : "Transfer failed";
    return NextResponse.json({ error: `OLC transfer failed: ${msg}` }, { status: 502 });
  }

  await recordClaim({
    completionId,
    questId,
    wallet,
    amount,
    txHash,
    claimedAt: new Date().toISOString(),
  });

  return NextResponse.json({
    txHash,
    amount,
    status: "claimed" as const,
    to: wallet,
    questId,
    completionId,
    photoHash: typeof body.photoHash === "string" ? body.photoHash.slice(0, 128) : undefined,
  });
}
