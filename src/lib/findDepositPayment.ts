/**
 * Find a recent deposit to the published address matching an exact pay amount
 * (± tolerance) after a given timestamp. Used by Pay Order confirm when
 * paymentTxHash is omitted.
 */

import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  parseAbiItem,
  type Hash,
} from "viem";
import { mainnet } from "viem/chains";
import { amountsMatch, type PayOrder } from "@/lib/presaleOrders";
import {
  hasDeliveredPayment,
  type PayAssetId,
  type VerifiedPayment,
} from "@/lib/verifyPayment";

const ETH_USDT = "0xdAC17F958D2ee523a2206206994597C13D831ec7" as const;
const ETH_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48" as const;

const TRANSFER = parseAbiItem(
  "event Transfer(address indexed from, address indexed to, uint256 value)",
);

function ethereumRpcUrls(): string[] {
  const env = process.env.ETHEREUM_RPC_URL?.trim();
  return [
    ...new Set(
      [
        env,
        "https://ethereum.publicnode.com",
        "https://cloudflare-eth.com",
        "https://rpc.ankr.com/eth",
      ].filter((u): u is string => Boolean(u)),
    ),
  ];
}

function solanaRpcUrls(): string[] {
  const env = process.env.SOLANA_RPC_URL?.trim();
  return [
    ...new Set(
      [
        env,
        "https://api.mainnet-beta.solana.com",
        "https://solana-rpc.publicnode.com",
      ].filter((u): u is string => Boolean(u)),
    ),
  ];
}

export type FoundDeposit = {
  paymentTxHash: string;
  payAmount: number;
  payAsset: PayAssetId;
  payerFrom?: string;
};

async function findSolanaDeposit(opts: {
  depositAddress: string;
  expectedAmount: number;
  createdAtMs: number;
}): Promise<FoundDeposit | null> {
  const sinceSec = Math.floor(opts.createdAtMs / 1000) - 60; // small clock skew
  for (const url of solanaRpcUrls()) {
    try {
      const sigRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getSignaturesForAddress",
          params: [opts.depositAddress, { limit: 40 }],
        }),
        cache: "no-store",
      });
      if (!sigRes.ok) continue;
      const sigJson = (await sigRes.json()) as {
        result?: Array<{ signature: string; blockTime?: number | null; err?: unknown }>;
      };
      const sigs = (sigJson.result ?? []).filter(
        (s) =>
          !s.err &&
          (s.blockTime == null || s.blockTime >= sinceSec) &&
          !hasDeliveredPayment(s.signature),
      );

      for (const s of sigs) {
        const txRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "getTransaction",
            params: [
              s.signature,
              {
                encoding: "jsonParsed",
                maxSupportedTransactionVersion: 0,
                commitment: "confirmed",
              },
            ],
          }),
          cache: "no-store",
        });
        if (!txRes.ok) continue;
        const txJson = (await txRes.json()) as {
          result?: {
            meta?: {
              err?: unknown;
              preBalances?: number[];
              postBalances?: number[];
            };
            transaction?: {
              message?: {
                accountKeys?: Array<string | { pubkey?: string }>;
              };
            };
            blockTime?: number | null;
          } | null;
        };
        const result = txJson.result;
        if (!result || result.meta?.err) continue;
        if (result.blockTime != null && result.blockTime < sinceSec) continue;

        const keys = (result.transaction?.message?.accountKeys ?? []).map((k) =>
          typeof k === "string" ? k : k.pubkey ?? "",
        );
        const idx = keys.findIndex((k) => k === opts.depositAddress);
        if (idx < 0) continue;
        const pre = result.meta?.preBalances?.[idx] ?? 0;
        const post = result.meta?.postBalances?.[idx] ?? 0;
        const delta = post - pre;
        if (delta <= 0) continue;
        const payAmount = delta / 1e9;
        if (!amountsMatch("SOL", opts.expectedAmount, payAmount)) continue;

        return {
          paymentTxHash: s.signature,
          payAmount,
          payAsset: "SOL",
          payerFrom: keys[0] || undefined,
        };
      }
      return null;
    } catch {
      /* try next RPC */
    }
  }
  return null;
}

async function findBitcoinDeposit(opts: {
  depositAddress: string;
  expectedAmount: number;
  createdAtMs: number;
}): Promise<FoundDeposit | null> {
  const expected = opts.depositAddress.toLowerCase();
  const sinceSec = Math.floor(opts.createdAtMs / 1000) - 60;
  const apis = [
    `https://mempool.space/api/address/${opts.depositAddress}/txs`,
    `https://blockstream.info/api/address/${opts.depositAddress}/txs`,
  ];
  for (const url of apis) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) continue;
      const txs = (await res.json()) as Array<{
        txid?: string;
        status?: { block_time?: number; confirmed?: boolean };
        vout?: Array<{ value?: number; scriptpubkey_address?: string }>;
      }>;
      for (const tx of txs.slice(0, 40)) {
        const txid = tx.txid;
        if (!txid || hasDeliveredPayment(txid)) continue;
        const bt = tx.status?.block_time;
        // Allow unconfirmed if recent scan window — still require ≥1 conf in verifyPayment
        if (typeof bt === "number" && bt < sinceSec) continue;

        let paidSats = 0;
        for (const out of tx.vout ?? []) {
          if ((out.scriptpubkey_address ?? "").toLowerCase() === expected) {
            paidSats += out.value ?? 0;
          }
        }
        if (paidSats <= 0) continue;
        const payAmount = paidSats / 1e8;
        if (!amountsMatch("BTC", opts.expectedAmount, payAmount)) continue;
        return { paymentTxHash: txid, payAmount, payAsset: "BTC" };
      }
      return null;
    } catch {
      /* next */
    }
  }
  return null;
}

async function findEthereumNativeDeposit(opts: {
  depositAddress: string;
  expectedAmount: number;
  createdAtMs: number;
}): Promise<FoundDeposit | null> {
  const to = getAddress(opts.depositAddress);
  // Prefer Blockscout account tx list (fast) then fall back to recent-block scan
  const explorers = [
    `https://eth.blockscout.com/api?module=account&action=txlist&address=${to}&sort=desc&page=1&offset=40`,
  ];
  const sinceSec = Math.floor(opts.createdAtMs / 1000) - 120;

  for (const url of explorers) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        status?: string;
        result?: Array<{
          hash?: string;
          to?: string;
          value?: string;
          timeStamp?: string;
          txreceipt_status?: string;
          isError?: string;
        }>;
      };
      const rows = Array.isArray(json.result) ? json.result : [];
      for (const row of rows) {
        if (!row.hash || hasDeliveredPayment(row.hash)) continue;
        if (row.isError === "1" || row.txreceipt_status === "0") continue;
        if (!row.to || getAddress(row.to) !== to) continue;
        const ts = Number(row.timeStamp ?? 0);
        if (ts && ts < sinceSec) continue;
        const wei = BigInt(row.value || "0");
        if (wei <= 0n) continue;
        const payAmount = Number(formatUnits(wei, 18));
        if (!amountsMatch("ETH", opts.expectedAmount, payAmount)) continue;
        return {
          paymentTxHash: row.hash.toLowerCase(),
          payAmount,
          payAsset: "ETH",
        };
      }
    } catch {
      /* fall through to RPC */
    }
  }

  // Light RPC lookback (~25 blocks ≈ 5 min) — user usually confirms quickly
  for (const rpc of ethereumRpcUrls()) {
    try {
      const pc = createPublicClient({
        chain: mainnet,
        transport: http(rpc, { timeout: 20_000 }),
      });
      const tip = await pc.getBlockNumber();
      const lookback = 40n;
      const start = tip > lookback ? tip - lookback : 0n;
      for (let b = tip; b >= start; b--) {
        const block = await pc.getBlock({ blockNumber: b, includeTransactions: true });
        if (block.timestamp < BigInt(sinceSec)) break;
        for (const tx of block.transactions) {
          if (typeof tx === "string") continue;
          if (!tx.to || getAddress(tx.to) !== to) continue;
          if (tx.value <= 0n) continue;
          if (hasDeliveredPayment(tx.hash)) continue;
          const payAmount = Number(formatUnits(tx.value, 18));
          if (!amountsMatch("ETH", opts.expectedAmount, payAmount)) continue;
          return {
            paymentTxHash: (tx.hash as Hash).toLowerCase(),
            payAmount,
            payAsset: "ETH",
            payerFrom: getAddress(tx.from),
          };
        }
      }
      return null;
    } catch {
      /* next rpc */
    }
  }
  return null;
}

async function findErc20Deposit(opts: {
  depositAddress: string;
  expectedAmount: number;
  createdAtMs: number;
  payAsset: "USDT" | "USDC";
}): Promise<FoundDeposit | null> {
  const to = getAddress(opts.depositAddress);
  const token = opts.payAsset === "USDT" ? ETH_USDT : ETH_USDC;
  const decimals = 6;
  const sinceSec = Math.floor(opts.createdAtMs / 1000) - 120;

  const explorers = [
    `https://eth.blockscout.com/api?module=account&action=tokentx&address=${to}&contractaddress=${token}&sort=desc&page=1&offset=40`,
  ];
  for (const url of explorers) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        result?: Array<{
          hash?: string;
          to?: string;
          value?: string;
          timeStamp?: string;
          from?: string;
        }>;
      };
      const rows = Array.isArray(json.result) ? json.result : [];
      for (const row of rows) {
        if (!row.hash || hasDeliveredPayment(row.hash)) continue;
        if (!row.to || getAddress(row.to) !== to) continue;
        const ts = Number(row.timeStamp ?? 0);
        if (ts && ts < sinceSec) continue;
        const raw = BigInt(row.value || "0");
        if (raw <= 0n) continue;
        const payAmount = Number(formatUnits(raw, decimals));
        if (!amountsMatch(opts.payAsset, opts.expectedAmount, payAmount)) continue;
        return {
          paymentTxHash: row.hash.toLowerCase(),
          payAmount,
          payAsset: opts.payAsset,
          payerFrom: row.from ? getAddress(row.from) : undefined,
        };
      }
    } catch {
      /* RPC fallback */
    }
  }

  for (const rpc of ethereumRpcUrls()) {
    try {
      const pc = createPublicClient({
        chain: mainnet,
        transport: http(rpc, { timeout: 20_000 }),
      });
      const tip = await pc.getBlockNumber();
      const lookback = 200n; // ~40 min
      const fromBlock = tip > lookback ? tip - lookback : 0n;
      const logs = await pc.getLogs({
        address: token,
        event: TRANSFER,
        args: { to },
        fromBlock,
        toBlock: tip,
      });
      for (const log of [...logs].reverse()) {
        const hash = log.transactionHash;
        if (!hash || hasDeliveredPayment(hash)) continue;
        const value = log.args.value;
        if (value == null || value <= 0n) continue;
        const payAmount = Number(formatUnits(value, decimals));
        if (!amountsMatch(opts.payAsset, opts.expectedAmount, payAmount)) continue;
        // Time filter via block if available — skip if too old when we can
        try {
          const block = await pc.getBlock({ blockNumber: log.blockNumber });
          if (block.timestamp < BigInt(sinceSec)) continue;
        } catch {
          /* keep candidate */
        }
        return {
          paymentTxHash: hash.toLowerCase(),
          payAmount,
          payAsset: opts.payAsset,
          payerFrom: log.args.from ? getAddress(log.args.from) : undefined,
        };
      }
      return null;
    } catch {
      /* next */
    }
  }
  return null;
}

/** Scan for a deposit matching this pay order (amount + time window). */
export async function findDepositForOrder(
  order: PayOrder,
): Promise<FoundDeposit | null> {
  const base = {
    depositAddress: order.depositAddress,
    expectedAmount: order.payAmount,
    createdAtMs: order.createdAt,
  };
  switch (order.payAsset) {
    case "SOL":
      return findSolanaDeposit(base);
    case "BTC":
      return findBitcoinDeposit(base);
    case "ETH":
      return findEthereumNativeDeposit(base);
    case "USDT":
    case "USDC":
      return findErc20Deposit({ ...base, payAsset: order.payAsset });
    default:
      return null;
  }
}

export type { VerifiedPayment };
