/**
 * Known-good BlockDAG Mainnet HTTP RPCs.
 *
 * https://rpc.bdagscan.com/ — may accept eth_sendRawTransaction but STATE is
 * empty/wrong (missing contract code, balances/nonce 0). NEVER use as sole (or
 * any) RPC for delivery, reads, receipts, or wallet_addEthereumChain.
 * Explorer UI at https://bdagscan.com remains fine.
 *
 * https://rpc.blockdag.engineering/ — good tip for reads / receipt waits, but
 * eth_sendRawTransaction returns -32601. Prefer for READ paths. Never for send.
 *
 * https://rpc.east.bdag-us.org/ — send-capable with correct state. Prefer FIRST
 * for eth_sendRawTransaction / OLC deliver / rescue when west returns 502.
 *
 * https://rpc.west.bdag-us.org/ — send-capable; use as fallback after east.
 */
import { TOKEN } from "./token";

const WEST_RPC = "https://rpc.west.bdag-us.org/";
const EAST_RPC = "https://rpc.east.bdag-us.org/";
const ENGINEERING_RPC = "https://rpc.blockdag.engineering/";

/** Empty/wrong state + bad tip — never for clients / receipts / wallet / deliver */
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
 * env overrides first, then engineering → east → west. Always filters bdagscan.
 * Prefer engineering for eth_call / receipts; west/east remain for tip diversity.
 */
export function blockdagHttpRpcUrls(): string[] {
  const envPrimary = process.env.NEXT_PUBLIC_BLOCKDAG_RPC?.trim();
  const envFallback = process.env.NEXT_PUBLIC_BLOCKDAG_RPC_FALLBACK?.trim();
  // Reads: engineering tip first (after env), then east/west. Never bdagscan.
  const candidates = [
    envPrimary,
    envFallback,
    ENGINEERING_RPC,
    EAST_RPC,
    WEST_RPC,
    TOKEN.rpcAlt,
    TOKEN.rpcFallback,
    TOKEN.rpcUrl,
  ];
  const list = candidates.filter(
    (u): u is string => typeof u === "string" && u.length > 0 && isKnownGoodBlockdagRpc(u),
  );
  const deduped = dedupe(list);
  if (deduped.length > 0) return deduped;
  // Absolute last resort if env somehow wiped everything to bad hosts
  return [ENGINEERING_RPC, EAST_RPC, WEST_RPC];
}

/**
 * Send-capable RPCs only (east + west + env that aren't known no-send / no-receipt-bad).
 * Use for wallet_addEthereumChain and any eth_sendRawTransaction / walletClient path.
 * Prefer east then west; never include engineering or bdagscan.
 */
export function blockdagWalletRpcUrls(): string[] {
  const envPrimary = process.env.NEXT_PUBLIC_BLOCKDAG_RPC?.trim();
  const envFallback = process.env.NEXT_PUBLIC_BLOCKDAG_RPC_FALLBACK?.trim();
  // Prefer east then west for broadcasts (west often 502; never bdagscan/engineering).
  // Hard-order: EAST first, WEST second — never let env push west (or other) ahead of east.
  const candidates = [EAST_RPC, WEST_RPC, envPrimary, envFallback, TOKEN.rpcUrl, TOKEN.rpcFallback];
  const list = candidates.filter(
    (u): u is string => typeof u === "string" && u.length > 0 && isSendCapableBlockdagRpc(u),
  );
  const deduped = dedupe(list);
  const east = deduped.filter((u) => hostOf(u) === "rpc.east.bdag-us.org");
  const west = deduped.filter((u) => hostOf(u) === "rpc.west.bdag-us.org");
  const other = deduped.filter((u) => {
    const h = hostOf(u);
    return h !== "rpc.east.bdag-us.org" && h !== "rpc.west.bdag-us.org";
  });
  // East → west → any other send-capable env RPCs (never ahead of east).
  const ordered = [...east, ...west, ...other];
  if (ordered.length > 0) return ordered;
  return [EAST_RPC, WEST_RPC];
}

export { WEST_RPC, EAST_RPC, ENGINEERING_RPC };
