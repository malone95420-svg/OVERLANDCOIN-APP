/**
 * Normalize a pasted payment tx hash OR full explorer URL into a bare tx id.
 * Supports etherscan / basescan-style, blockchain.com, mempool.space, solscan, bdagscan.
 */

export function parsePaymentTxRef(raw: string): string {
  const input = raw.trim();
  if (!input) return "";

  // If it looks like a URL, pull the hash from a known path segment.
  if (/^https?:\/\//i.test(input) || input.includes("/")) {
    try {
      const url = /^https?:\/\//i.test(input)
        ? new URL(input)
        : new URL(input.startsWith("/") ? `https://x${input}` : `https://${input}`);
      const path = url.pathname;

      const patterns: RegExp[] = [
        /\/tx\/(0x[a-fA-F0-9]{64})/i,
        /\/tx\/([a-fA-F0-9]{64})\b/i,
        /\/transaction\/([1-9A-HJ-NP-Za-km-z]{64,128})/,
        /\/tx\/([1-9A-HJ-NP-Za-km-z]{64,128})/,
        /\/btc\/tx\/([a-fA-F0-9]{64})/i,
        /\/tx\/([a-zA-Z0-9]+)/,
      ];
      for (const re of patterns) {
        const m = path.match(re);
        if (m?.[1]) return m[1];
      }

      // Query ?tx= or ?txid=
      for (const key of ["tx", "txid", "hash", "signature"]) {
        const q = url.searchParams.get(key);
        if (q && q.length >= 32) return q.trim();
      }
    } catch {
      /* fall through */
    }
  }

  return input;
}

/** Soft friendly error when RPC/explorer dumps look ugly. */
export function friendlyPaymentError(raw: string | undefined | null): string {
  const msg = (raw ?? "").trim();
  if (!msg) {
    return "No matching payment found yet — wait a minute and try again.";
  }
  if (/no matching|not found|not confirmed yet|no .* transfer|no .* output|no positive SOL/i.test(msg)) {
    return "No matching payment found yet — wait a minute and try again.";
  }
  if (/rate limit|429|too many/i.test(msg)) {
    return "Too many attempts — wait a minute and try again.";
  }
  if (/wrong network|does not involve|does not match/i.test(msg)) {
    return msg.length > 180 ? `${msg.slice(0, 177)}…` : msg;
  }
  // Strip raw RPC JSON dumps / stack-ish noise
  if (/[{}\[\]\\]/.test(msg) && msg.length > 120) {
    return "No matching payment found yet — wait a minute and try again.";
  }
  if (msg.length > 220) return `${msg.slice(0, 217)}…`;
  return msg;
}
