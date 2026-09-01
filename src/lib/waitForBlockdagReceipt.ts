/**
 * Poll transaction receipts only on known-good BlockDAG RPCs.
 * Avoids hanging forever when a stale RPC (e.g. rpc.bdagscan.com) returns
 * TransactionReceiptNotFound for txs that are confirmed on the real tip.
 */
import { createPublicClient, http, type Hash, type TransactionReceipt } from "viem";
import { blockdagHttpRpcUrls } from "./blockdagRpc";
import { blockdag } from "./chain";

export type WaitReceiptResult =
  | { ok: true; receipt: TransactionReceipt; rpcUrl: string }
  | { ok: false; timedOut: true; lastError?: string };

export async function waitForBlockdagReceipt(
  hash: Hash,
  opts?: { timeoutMs?: number; pollMs?: number },
): Promise<WaitReceiptResult> {
  const timeoutMs = opts?.timeoutMs ?? 90_000;
  const pollMs = opts?.pollMs ?? 2_000;
  const urls = blockdagHttpRpcUrls();
  const clients = urls.map((url) => ({
    url,
    client: createPublicClient({ chain: blockdag, transport: http(url, { timeout: 12_000 }) }),
  }));

  const started = Date.now();
  let lastError: string | undefined;

  while (Date.now() - started < timeoutMs) {
    for (const { url, client } of clients) {
      try {
        const receipt = await client.getTransactionReceipt({ hash });
        if (receipt) {
          return { ok: true, receipt, rpcUrl: url };
        }
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
        // Receipt not found yet on this tip — keep polling
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  return { ok: false, timedOut: true, lastError };
}
