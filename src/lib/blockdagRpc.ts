/**
 * Known-good BlockDAG Mainnet HTTP RPCs.
 * https://rpc.bdagscan.com/ is on a divergent/stale tip (~17.65M vs ~19.80M)
 * and returns TransactionReceiptNotFound for confirmed txs — never use it for
 * wagmi transports, receipt waits, or server deliver/credit clients.
 * Explorer UI at https://bdagscan.com remains fine.
 */
import { TOKEN } from "./token";

const KNOWN_BAD_RPC_HOSTS = new Set(["rpc.bdagscan.com"]);

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isKnownGoodBlockdagRpc(url: string): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return !KNOWN_BAD_RPC_HOSTS.has(host);
}

/**
 * Deduped HTTP RPC list for clients: env overrides first, then TOKEN defaults.
 * Always filters known-bad hosts (even if an env var still points at them).
 */
export function blockdagHttpRpcUrls(): string[] {
  const envPrimary = process.env.NEXT_PUBLIC_BLOCKDAG_RPC?.trim();
  const envFallback = process.env.NEXT_PUBLIC_BLOCKDAG_RPC_FALLBACK?.trim();
  const candidates = [envPrimary, envFallback, TOKEN.rpcUrl, TOKEN.rpcFallback, TOKEN.rpcAlt];
  const list = candidates.filter(
    (u): u is string => typeof u === "string" && u.length > 0 && isKnownGoodBlockdagRpc(u),
  );
  const deduped = [...new Set(list)];
  if (deduped.length > 0) return deduped;
  // Absolute last resort if env somehow wiped everything to bad hosts
  return ["https://rpc.west.bdag-us.org/", "https://rpc.blockdag.engineering/"];
}
