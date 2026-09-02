/**
 * GET/POST /api/cron/presale-scan
 *
 * Protected by CRON_SECRET (Authorization: Bearer … or ?secret=).
 * Skips entirely if CRON_SECRET is unset.
 *
 * Scans recent treasury deposits on BlockDAG (native BDAG) and Ethereum (ETH),
 * and credits unmatched txs to the payer address (same EVM key as BlockDAG buyer).
 * USDT/USDC/BTC/SOL still require user confirm-deposit (buyer mapping).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  parseAbiItem,
  type Hash,
} from "viem";
import { mainnet } from "viem/chains";
import { blockdag } from "@/lib/chain";
import { creditVerifiedPurchase } from "@/lib/presaleCredit";
import { SITE } from "@/lib/site";
import { DEFAULT_EVM_DEPOSIT_ADDRESS } from "@/lib/acceptedPayAssets";
import { presaleReadRpcUrls } from "@/lib/presaleLock";
import {
  hasDeliveredPayment,
  verifyPaymentAndQuote,
  type PayAssetId,
  type PayChain,
} from "@/lib/verifyPayment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

function treasury(): `0x${string}` {
  const raw =
    process.env.NEXT_PUBLIC_DEPOSIT_ETH?.trim() ||
    SITE.treasuryAddress ||
    DEFAULT_EVM_DEPOSIT_ADDRESS;
  return getAddress(raw);
}

function authorize(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const q = req.nextUrl.searchParams.get("secret");
  return q === secret;
}

function ethereumRpcUrls(): string[] {
  const env = process.env.ETHEREUM_RPC_URL?.trim();
  return [
    ...new Set(
      [env, "https://ethereum.publicnode.com", "https://cloudflare-eth.com"].filter(
        (u): u is string => Boolean(u),
      ),
    ),
  ];
}

async function scanBlockdagNative(lookbackBlocks = 400): Promise<
  Array<{ hash: Hash; from: `0x${string}`; value: bigint }>
> {
  const urls = presaleReadRpcUrls();
  const to = treasury();
  for (const url of urls) {
    try {
      const pc = createPublicClient({
        chain: blockdag,
        transport: http(url, { timeout: 20_000 }),
      });
      const tip = await pc.getBlockNumber();
      const fromBlock = tip > BigInt(lookbackBlocks) ? tip - BigInt(lookbackBlocks) : 0n;
      const found: Array<{ hash: Hash; from: `0x${string}`; value: bigint }> = [];

      // Sample recent blocks for native transfers (no eth_getLogs for native value)
      const step = 1n;
      const maxBlocks = 80n; // keep cron light
      const start = tip > maxBlocks ? tip - maxBlocks : fromBlock;
      for (let b = tip; b >= start; b -= step) {
        try {
          const block = await pc.getBlock({ blockNumber: b, includeTransactions: true });
          for (const tx of block.transactions) {
            if (typeof tx === "string") continue;
            if (!tx.to || getAddress(tx.to) !== to) continue;
            if (tx.value <= 0n) continue;
            if (hasDeliveredPayment(tx.hash)) continue;
            found.push({ hash: tx.hash, from: getAddress(tx.from), value: tx.value });
          }
        } catch {
          /* skip block */
        }
      }
      return found;
    } catch {
      /* try next RPC */
    }
  }
  return [];
}

async function scanEthereumEth(lookbackBlocks = 30): Promise<
  Array<{ hash: Hash; from: `0x${string}`; value: bigint }>
> {
  const to = treasury();
  for (const url of ethereumRpcUrls()) {
    try {
      const pc = createPublicClient({
        chain: mainnet,
        transport: http(url, { timeout: 20_000 }),
      });
      const tip = await pc.getBlockNumber();
      const start = tip > BigInt(lookbackBlocks) ? tip - BigInt(lookbackBlocks) : 0n;
      const found: Array<{ hash: Hash; from: `0x${string}`; value: bigint }> = [];
      for (let b = tip; b >= start; b--) {
        try {
          const block = await pc.getBlock({ blockNumber: b, includeTransactions: true });
          for (const tx of block.transactions) {
            if (typeof tx === "string") continue;
            if (!tx.to || getAddress(tx.to) !== to) continue;
            if (tx.value <= 0n) continue;
            if (hasDeliveredPayment(tx.hash)) continue;
            found.push({ hash: tx.hash, from: getAddress(tx.from), value: tx.value });
          }
        } catch {
          /* */
        }
      }
      return found;
    } catch {
      /* */
    }
  }
  void TRANSFER;
  return [];
}

async function tryCredit(opts: {
  chain: PayChain;
  hash: string;
  buyer: `0x${string}`;
  payAsset: PayAssetId;
}) {
  if (hasDeliveredPayment(opts.hash)) {
    return { skipped: true as const, reason: "already_delivered" };
  }
  const verified = await verifyPaymentAndQuote({
    chain: opts.chain,
    paymentTxHash: opts.hash,
    payAsset: opts.payAsset,
    buyer: opts.chain === "blockdag" ? opts.buyer : undefined,
  });
  if (!verified.ok) {
    return { skipped: true as const, reason: verified.error };
  }
  // Sanity: pay amount should match roughly
  void formatUnits;
  const result = await creditVerifiedPurchase({
    buyer: opts.buyer,
    payment: verified.payment,
    quote: verified.quote,
  });
  return { skipped: false as const, result };
}

async function runScan() {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      {
        skipped: true,
        message: "CRON_SECRET unset — presale-scan disabled",
      },
      { status: 200 },
    );
  }

  const credited: unknown[] = [];
  const errors: unknown[] = [];

  const bdag = await scanBlockdagNative();
  for (const tx of bdag.slice(0, 15)) {
    try {
      const out = await tryCredit({
        chain: "blockdag",
        hash: tx.hash,
        buyer: tx.from,
        payAsset: "BDAG",
      });
      if (!out.skipped && out.result.status === "locked") {
        credited.push({
          chain: "blockdag",
          hash: tx.hash,
          buyer: tx.from,
          olcAmount: out.result.olcAmount,
          creditTxHash: out.result.creditTxHash,
        });
      } else if (out.skipped) {
        errors.push({ hash: tx.hash, reason: out.reason });
      } else {
        const r = out.result;
        errors.push({
          hash: tx.hash,
          status: r.status,
          error: r.status === "locked_pending_chain" ? r.error : undefined,
        });
      }
    } catch (e) {
      errors.push({
        hash: tx.hash,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const eth = await scanEthereumEth();
  for (const tx of eth.slice(0, 10)) {
    try {
      const out = await tryCredit({
        chain: "ethereum",
        hash: tx.hash,
        buyer: tx.from,
        payAsset: "ETH",
      });
      if (!out.skipped && out.result.status === "locked") {
        credited.push({
          chain: "ethereum",
          hash: tx.hash,
          buyer: tx.from,
          olcAmount: out.result.olcAmount,
          creditTxHash: out.result.creditTxHash,
        });
      } else if (out.skipped) {
        errors.push({ hash: tx.hash, reason: out.reason });
      } else {
        const r = out.result;
        errors.push({
          hash: tx.hash,
          status: r.status,
          error: r.status === "locked_pending_chain" ? r.error : undefined,
        });
      }
    } catch (e) {
      errors.push({
        hash: tx.hash,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    scanned: { blockdag: bdag.length, ethereum: eth.length },
    credited,
    notes: errors.slice(0, 20),
    treasury: treasury(),
  });
}

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET?.trim()) {
    return NextResponse.json(
      { skipped: true, message: "CRON_SECRET unset — presale-scan disabled" },
      { status: 200 },
    );
  }
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runScan();
}

export async function POST(req: NextRequest) {
  return GET(req);
}
