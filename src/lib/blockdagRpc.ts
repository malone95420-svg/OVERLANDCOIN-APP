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
 * for eth_sendRawTransaction / OLC deliver / rescue / wallet_addEthereumChain.
 *
 * https://rpc.west.bdag-us.org/ — not used (west DAG disabled for wallets and sends).
 */
import { TOKEN } from "./token";

const WEST_RPC = "https://rpc.west.bdag-us.org/";
const EAST_RPC = "https://rpc.east.bdag-us.org/";
const ENGINEERING_RPC = "https://rpc.blockdag.engineering/";

/** Empty/wrong state + bad tip — never for clients / receipts / wallet / deliver */
const KNOWN_BAD_RECEIPT_RPC_HOSTS = new Set(["rpc.bdagscan.com"]);

/** Good tip for reads, but eth_sendRawTransaction is missing */
const KNOWN_NO_SEND_RPC_HOSTS = new Set(["rpc.blockdag.engineering"]);

/** West DAG — do not use for wallets or broadcasts. */
const KNOWN_WEST_RPC_HOSTS = new Set(["rpc.west.bdag-us.org"]);

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
  if (KNOWN_BAD_RECEIPT_RPC_HOSTS.has(host)) return false;
  if (KNOWN_WEST_RPC_HOSTS.has(host)) return false;
  return true;
}

/** Supports eth_sendRawTransaction — never bdagscan, never engineering. */
export function isSendCapableBlockdagRpc(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  if (KNOWN_BAD_RECEIPT_RPC_HOSTS.has(host)) return false;
  if (KNOWN_NO_SEND_RPC_HOSTS.has(host)) return false;
  if (KNOWN_WEST_RPC_HOSTS.has(host)) return false;
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
  // Reads: east first (engineering is often 503). Never bdagscan or west.
  const candidates = [
    envPrimary,
    envFallback,
    EAST_RPC,
    ENGINEERING_RPC,
    TOKEN.rpcAlt,
    TOKEN.rpcUrl,
  ];
  const list = candidates.filter(
    (u): u is string => typeof u === "string" && u.length > 0 && isKnownGoodBlockdagRpc(u),
  );
  const deduped = dedupe(list);
  if (deduped.length > 0) return deduped;
  // Absolute last resort if env somehow wiped everything to bad hosts
  return [EAST_RPC, ENGINEERING_RPC];
}

/**
 * Send-capable RPCs only (east + env that aren't no-send / west / bdagscan).
 * Use for wallet_addEthereumChain and any eth_sendRawTransaction / walletClient path.
 */
export function blockdagWalletRpcUrls(): string[] {
  const envPrimary = process.env.NEXT_PUBLIC_BLOCKDAG_RPC?.trim();
  const candidates = [EAST_RPC, envPrimary, TOKEN.rpcUrl];
  const list = candidates.filter(
    (u): u is string => typeof u === "string" && u.length > 0 && isSendCapableBlockdagRpc(u),
  );
  const deduped = dedupe(list);
  const east = deduped.filter((u) => hostOf(u) === "rpc.east.bdag-us.org");
  const other = deduped.filter((u) => hostOf(u) !== "rpc.east.bdag-us.org");
  const ordered = [...east, ...other];
  if (ordered.length > 0) return ordered;
  return [EAST_RPC];
}

export { WEST_RPC, EAST_RPC, ENGINEERING_RPC };
