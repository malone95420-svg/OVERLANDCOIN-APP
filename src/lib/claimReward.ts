/**
 * Client helper: claim pending OLC for a completion via POST /api/rewards/claim.
 * Marks local completion claimed only when the API returns a real txHash.
 */

import {
  loadCompletions,
  loadPosts,
  markCompletionClaimed,
  type Completion,
} from "@/lib/completions";
import { getOrCreateDeviceId } from "@/lib/deviceId";
import { markQuestCompletedOnDevice } from "@/lib/deviceQuests";
import { explorerTxUrl } from "@/lib/token";

export type ClaimSuccess = {
  ok: true;
  txHash: string;
  amount: number;
  status: "claimed";
  explorerUrl: string;
  completion: Completion;
};

export type ClaimFailure = {
  ok: false;
  error: string;
  status?: number;
  /** True when server rewards wallet is not configured (demo mode). */
  notConfigured?: boolean;
};

export type ClaimResult = ClaimSuccess | ClaimFailure;

export type ClaimInput = {
  completion: Completion;
  wallet: string;
  /** Optional photo content hash / metadata (not required for MVP). */
  photoHash?: string;
};

export async function claimRewardToWallet(input: ClaimInput): Promise<ClaimResult> {
  const { completion, wallet, photoHash } = input;
  if (!wallet) {
    return { ok: false, error: "Connect a wallet first." };
  }
  if (completion.status === "claimed" && completion.txHash) {
    return {
      ok: true,
      txHash: completion.txHash,
      amount: completion.olcEarned,
      status: "claimed",
      explorerUrl: explorerTxUrl(completion.txHash),
      completion,
    };
  }

  try {
    const res = await fetch("/api/rewards/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        completionId: completion.id,
        questId: completion.questId,
        wallet,
        olcEarned: completion.olcEarned,
        completedAt: completion.completedAt,
        lat: completion.lat,
        lng: completion.lng,
        distanceM: completion.distanceM,
        photoHash: photoHash ?? undefined,
        deviceId: getOrCreateDeviceId() || undefined,
      }),
    });

    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
      txHash?: string;
      amount?: number;
      status?: string;
      notConfigured?: boolean;
    };

    if (res.status === 503 || data.notConfigured) {
      return {
        ok: false,
        error:
          data.message ||
          data.error ||
          "Rewards wallet is not configured. Set REWARD_PRIVATE_KEY on the server.",
        status: 503,
        notConfigured: true,
      };
    }

    const txHash = data.txHash;
    const accepted = Boolean(txHash) && (res.ok || res.status === 409);
    if (!accepted || !txHash) {
      return {
        ok: false,
        error: data.error || data.message || `Claim failed (${res.status})`,
        status: res.status,
      };
    }

    const marked = markCompletionClaimed(completion.id, {
      txHash,
      wallet,
      amount: typeof data.amount === "number" ? data.amount : completion.olcEarned,
    });
    if (!marked.ok) {
      // Still seal the device so the quest cannot be re-completed after a paid claim.
      markQuestCompletedOnDevice(completion.questId);
      return {
        ok: false,
        error: `Paid on-chain (${txHash.slice(0, 10)}…) but local save failed: ${marked.error}`,
        status: res.status,
      };
    }

    markQuestCompletedOnDevice(completion.questId);

    return {
      ok: true,
      txHash,
      amount: marked.completion.olcEarned,
      status: "claimed",
      explorerUrl: explorerTxUrl(txHash),
      completion: marked.completion,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Network error claiming reward",
    };
  }
}

export async function claimAllPending(wallet: string): Promise<{
  claimed: ClaimSuccess[];
  failed: { completionId: string; error: string }[];
}> {
  const pending = loadCompletions().filter((c) => c.status === "pending_claim");
  const claimed: ClaimSuccess[] = [];
  const failed: { completionId: string; error: string }[] = [];

  for (const c of pending) {
    const res = await claimRewardToWallet({ completion: c, wallet });
    if (res.ok) claimed.push(res);
    else failed.push({ completionId: c.id, error: res.error });
  }

  void loadPosts();
  return { claimed, failed };
}
