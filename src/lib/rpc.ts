/**
 * Minimal eth_call helper for ERC-20 name/symbol/decimals/totalSupply.
 * Gracefully falls back to static TOKEN config if RPC is unavailable.
 */
import { blockdagHttpRpcUrls } from "./blockdagRpc";
import { TOKEN } from "./token";

export type OnChainTokenInfo = {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  totalSupplyRaw: string;
  source: "rpc" | "fallback";
};

/** Keccak selectors for common ERC-20 views (precomputed). */
const SELECTORS = {
  name: "0x06fdde03",
  symbol: "0x95d89b41",
  decimals: "0x313ce567",
  totalSupply: "0x18160ddd",
} as const;

async function ethCall(
  rpc: string,
  to: string,
  data: string,
  timeoutMs = 8000
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    const json = (await res.json()) as { result?: string; error?: { message: string } };
    if (json.error) throw new Error(json.error.message);
    if (!json.result || json.result === "0x") throw new Error("Empty eth_call result");
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

function decodeString(hex: string): string {
  const raw = hex.replace(/^0x/, "");
  if (raw.length === 64) {
    // Some tokens return short string encoding
    const bytes = Buffer.from(raw, "hex");
    const nul = bytes.indexOf(0);
    return bytes.subarray(0, nul === -1 ? bytes.length : nul).toString("utf8").trim();
  }
  // ABI dynamic string: offset (32) + length (32) + data
  const len = parseInt(raw.slice(64, 128), 16);
  const data = raw.slice(128, 128 + len * 2);
  return Buffer.from(data, "hex").toString("utf8");
}

function decodeUint(hex: string): bigint {
  return BigInt(hex);
}

function formatSupply(raw: bigint, decimals: number): string {
  const base = BigInt(10) ** BigInt(decimals);
  const whole = raw / base;
  return whole.toLocaleString("en-US");
}

async function callWithFallback(data: string): Promise<string> {
  const urls = blockdagHttpRpcUrls();
  let lastErr: unknown;
  for (const url of urls) {
    try {
      return await ethCall(url, TOKEN.contractAddress, data);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("All BlockDAG RPCs failed");
}

export function fallbackTokenInfo(): OnChainTokenInfo {
  return {
    name: TOKEN.name,
    symbol: TOKEN.symbol,
    decimals: TOKEN.decimals,
    totalSupply: TOKEN.totalSupplyFormatted,
    totalSupplyRaw: (TOKEN.totalSupply * (BigInt(10) ** BigInt(TOKEN.decimals))).toString(),
    source: "fallback",
  };
}

export async function fetchTokenInfo(): Promise<OnChainTokenInfo> {
  try {
    const [nameHex, symbolHex, decimalsHex, supplyHex] = await Promise.all([
      callWithFallback(SELECTORS.name),
      callWithFallback(SELECTORS.symbol),
      callWithFallback(SELECTORS.decimals),
      callWithFallback(SELECTORS.totalSupply),
    ]);

    const decimals = Number(decodeUint(decimalsHex));
    const supplyRaw = decodeUint(supplyHex);

    return {
      name: decodeString(nameHex) || TOKEN.name,
      symbol: decodeString(symbolHex) || TOKEN.symbol,
      decimals: Number.isFinite(decimals) ? decimals : TOKEN.decimals,
      totalSupply: formatSupply(supplyRaw, Number.isFinite(decimals) ? decimals : TOKEN.decimals),
      totalSupplyRaw: supplyRaw.toString(),
      source: "rpc",
    };
  } catch {
    return fallbackTokenInfo();
  }
}
