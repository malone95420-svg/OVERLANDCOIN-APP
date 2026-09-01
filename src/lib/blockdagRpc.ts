/**
 * Known-good BlockDAG Mainnet HTTP RPCs.
 *
 * https://rpc.bdagscan.com/ — divergent/stale tip (~17.65M vs ~19.80M); returns
 * TransactionReceiptNotFound for confirmed txs. Never use for wagmi transports,
 * receipt waits, wallet_addEthereumChain, or server deliver/credit clients.
 * Explorer UI at https://bdagscan.com remains fine.
 *
 * https://rpc.blockdag.engineering/ — good tip for reads / receipt waits, but
 * eth_sendRawTransaction returns -32601 method not found. Treat as READ-ONLY /
 * no-send: OK in publicClient + receipt fallbacks, NEVER in MetaMask rpcUrls or
 * any broadcast path.
 *
 * https://rpc.west.bdag-us.org/ — send-capable (eth_sendRawTransaction works).
 * Prefer this first for wallet_addEthereumChain and server tx broadcast.
 *
 * https://rpc.east.bdag-us.org/ — send-capable; same good tip as engineering.
 * Use as send fallback when west is down (502), and prefer early in read lists
 * so eth_call / receipts survive west outages.
 */
import { TOKEN } from "./token";

const WEST_RPC = "https://rpc.west.bdag-us.org/";
const EAST_RPC = "https://rpc.east.bdag-us.org/";
const ENGINEERING_RPC = "https://rpc.blockdag.engineering/";

/** Divergent tip — never for clients / receipts / wallet */
const KNOWN_BAD_RECEIPT_RPC_HOSTS = new Set(["rpc.bdagscan.com"]);

/** Good tip for reads, but eth_sendRawTransaction is missing */
const KNOWN_NO_SEND_RPC_HOSTS = new Set(["rpc.blockdag.engineering"]);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

/** Not bdagscan — OK for reads / receipt waits (may still be no-send). */
export function isKnownGoodBlockdagRpc(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return !KNOWN_BAD_RECEIPT_RPC_HOSTS.has(host);
}

/** Supports eth_sendRawTransaction — never bdagscan, never engineering. */
export function isSendCapableBlockdagRpc(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (KNOWN_BAD_RECEIPT_RPC_HOSTS.has(host)) return false;
  if (KNOWN_NO_SEND_RPC_HOSTS.has(host)) return false;
  return true;
}

/** True when host is known to lack eth_sendRawTransaction (engineering). */
export function isReadOnlyNoSendBlockdagRpc(url: string): boolean {
  return KNOWN_NO_SEND_RPC_HOSTS.has(hostOf(url));
}

function dedupe(urls: string[]): string[] {
  return [...new Set(urls)];
}

/**
 * Deduped HTTP RPC list for publicClient reads + receipt waits:
 * env overrides first, then east → west → engineering. Always filters bdagscan.
 * May include engineering (read-only / no-send, good tip).
 * Prefer east/west ahead of engineering so reads survive west 502 without
 * depending on a single send-capable host.
 */
export function blockdagHttpRpcUrls(): string[] {
  const envPrimary = process.env.NEXT_PUBLIC_BLOCKDAG_RPC?.trim();
  const envFallback = process.env.NEXT_PUBLIC_BLOCKDAG_RPC_FALLBACK?.trim();
  const candidates = [
    envPrimary,
    envFallback,
    EAST_RPC,
    WEST_RPC,
    ENGINEERING_RPC,
    TOKEN.rpcUrl,
    TOKEN.rpcFallback,
    TOKEN.rpcAlt,
  ];
  const list = candidates.filter(
    (u): u is string => typeof u === "string" && u.length > 0 && isKnownGoodBlockdagRpc(u),
  );
  const deduped = dedupe(list);
  if (deduped.length > 0) return deduped;
  // Absolute last resort if env somehow wiped everything to bad hosts
  return [EAST_RPC, WEST_RPC, ENGINEERING_RPC];
}

/**
 * Send-capable RPCs only (west + east + env that aren't known no-send / no-receipt-bad).
 * Use for wallet_addEthereumChain and any eth_sendRawTransaction / walletClient path.
 * Prefer west then east; never include engineering or bdagscan.
 */
export function blockdagWalletRpcUrls(): string[] {
  const envPrimary = process.env.NEXT_PUBLIC_BLOCKDAG_RPC?.trim();
  const envFallback = process.env.NEXT_PUBLIC_BLOCKDAG_RPC_FALLBACK?.trim();
  const candidates = [envPrimary, envFallback, WEST_RPC, EAST_RPC, TOKEN.rpcUrl];
  const list = candidates.filter(
    (u): u is string => typeof u === "string" && u.length > 0 && isSendCapableBlockdagRpc(u),
  );
  const deduped = dedupe(list);
  if (deduped.length > 0) return deduped;
  return [WEST_RPC, EAST_RPC];
}

export { WEST_RPC, EAST_RPC, ENGINEERING_RPC };
