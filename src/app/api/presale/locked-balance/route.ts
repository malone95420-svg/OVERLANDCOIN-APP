import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  formatUnits,
  http,
  isAddress,
  getAddress,
} from "viem";
import { blockdag } from "@/lib/chain";
import {
  PRESALE_LOCK_ABI,
  getPresaleLockAddress,
  presaleReadRpcUrls,
} from "@/lib/presaleLock";
import { TOKEN } from "@/lib/token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-side PresaleLock read — works regardless of the user's MetaMask chain.
 * GET /api/presale/locked-balance?address=0x...
 */
export async function GET(req: NextRequest) {
  const addressRaw = req.nextUrl.searchParams.get("address")?.trim() ?? "";
  if (!addressRaw || !isAddress(addressRaw)) {
    return NextResponse.json(
      { error: "address must be a valid EVM address" },
      { status: 400 },
    );
  }

  const lockAddress = getPresaleLockAddress();
  if (!lockAddress) {
    return NextResponse.json(
      {
        error: "Presale lock address not configured",
        locked: 0,
        totalLocked: 0,
        tradingEnabled: false,
        lockAddress: null,
      },
      { status: 503 },
    );
  }

  const user = getAddress(addressRaw);
  const urls = presaleReadRpcUrls();
  let lastErr: unknown;

  for (const url of urls) {
    try {
      const pc = createPublicClient({ chain: blockdag, transport: http(url) });
      const [lockedWei, totalLockedWei, tradingEnabled] = await Promise.all([
        pc.readContract({
          address: lockAddress,
          abi: PRESALE_LOCK_ABI,
          functionName: "lockedBalance",
          args: [user],
        }),
        pc.readContract({
          address: lockAddress,
          abi: PRESALE_LOCK_ABI,
          functionName: "totalLocked",
        }),
        pc.readContract({
          address: lockAddress,
          abi: PRESALE_LOCK_ABI,
          functionName: "tradingEnabled",
        }),
      ]);

      const locked = Number(formatUnits(lockedWei as bigint, TOKEN.decimals));
      const totalLocked = Number(
        formatUnits(totalLockedWei as bigint, TOKEN.decimals),
      );

      return NextResponse.json({
        locked: Number.isFinite(locked) ? locked : 0,
        totalLocked: Number.isFinite(totalLocked) ? totalLocked : 0,
        tradingEnabled: Boolean(tradingEnabled),
        lockAddress,
      });
    } catch (e) {
      lastErr = e;
    }
  }

  const msg =
    lastErr instanceof Error ? lastErr.message : "RPC read failed for PresaleLock";
  return NextResponse.json(
    {
      error: msg,
      locked: 0,
      totalLocked: 0,
      tradingEnabled: false,
      lockAddress,
    },
    { status: 502 },
  );
}
