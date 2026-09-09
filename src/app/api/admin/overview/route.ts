/**
 * GET /api/admin/overview
 *
 * Ops overview: on-chain OLC balances of the two hot wallets that pay out tokens
 * (presale deliver + quest rewards) plus totals sold / claimed.
 *
 * Auth (required): Authorization: Bearer <PRESALE_ADMIN_SECRET>
 *               or x-presale-admin-secret: <PRESALE_ADMIN_SECRET>
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  fallback,
  formatUnits,
  getAddress,
  http,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { blockdag } from "@/lib/chain";
import { presaleReadRpcUrls } from "@/lib/presaleLock";
import { TOKEN } from "@/lib/token";
import { getTotalDeliveredOlc } from "@/lib/verifyPayment";
import { getTotalClaimedOlc } from "@/lib/claimsLedger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function adminSecretConfigured(): string | null {
  const s = process.env.PRESALE_ADMIN_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
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
  const auth = req.headers.get("authorization")?.trim() ?? "";
  const presented = /^Bearer\s+/i.test(auth)
    ? auth.replace(/^Bearer\s+/i, "").trim()
    : (req.headers.get("x-presale-admin-secret")?.trim() ?? "");
  if (!presented || presented !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function normalizeKey(raw: string): Hex | null {
  const t = raw.trim();
  const with0x = t.startsWith("0x") ? t : `0x${t}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(with0x)) return null;
  return with0x as Hex;
}

function addressForKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const key = normalizeKey(raw);
  if (!key) return null;
  try {
    return privateKeyToAccount(key).address;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;

  const rewardKey = process.env.REWARD_PRIVATE_KEY?.trim();
  const deliverKey = process.env.PRESALE_DELIVER_PRIVATE_KEY?.trim() || rewardKey;

  const rewardAddress = addressForKey(rewardKey);
  const deliverAddress = addressForKey(deliverKey);

  const pc = createPublicClient({
    chain: blockdag,
    transport: fallback(presaleReadRpcUrls().map((url) => http(url))),
  });

  async function balanceOf(addr: string | null): Promise<string | null> {
    if (!addr) return null;
    try {
      const bal = await pc.readContract({
        address: TOKEN.contractAddress,
        abi: ERC20_BALANCE_ABI,
        functionName: "balanceOf",
        args: [getAddress(addr)],
      });
      return bal.toString();
    } catch {
      return null;
    }
  }

  const [rewardBalance, deliverBalance, totalDelivered, totalClaimed] = await Promise.all([
    balanceOf(rewardAddress),
    balanceOf(deliverAddress),
    getTotalDeliveredOlc(),
    getTotalClaimedOlc(),
  ]);

  const fmt = (wei: string | null): string | null =>
    wei == null ? null : formatUnits(BigInt(wei), TOKEN.decimals);

  return NextResponse.json({
    chainId: TOKEN.chainId,
    chainName: TOKEN.chainName,
    rewardWallet: {
      address: rewardAddress,
      balanceWei: rewardBalance,
      balanceOlc: fmt(rewardBalance),
    },
    deliverWallet: {
      address: deliverAddress,
      balanceWei: deliverBalance,
      balanceOlc: fmt(deliverBalance),
    },
    totalDeliveredOlc: totalDelivered,
    totalClaimedOlc: totalClaimed,
  });
}
