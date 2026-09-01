/**
 * Quest completions + adventure feed posts (localStorage v1).
 * OLC starts as pending_claim; claim via POST /api/rewards/claim sets status claimed + txHash.
 */

import type { Quest } from "@/data/quests";

import { scopedStorageKey } from "@/lib/auth/accountScope";

export const COMPLETIONS_STORAGE_KEY = "overlandcoin.completions.v1";
export const POSTS_STORAGE_KEY = "overlandcoin.posts.v1";
/** Client-side claimed completion ids (mirrors server ledger for UX / anti-double-claim). */
export const CLAIMS_STORAGE_KEY = "overlandcoin.claims.v1";

export type CompletionStatus = "pending_claim" | "claimed";

export type Completion = {
  id: string;
  questId: string;
  completedAt: string; // ISO
  lat: number;
  lng: number;
  distanceM: number;
  /** Compressed JPEG data URL (max ~800px wide). */
  photoDataUrl: string;
  caption: string;
  olcEarned: number;
  status: CompletionStatus;
  /** Set after successful on-chain payout. */
  txHash?: string;
  claimedAt?: string;
  claimedWallet?: string;
};

export type FeedPostBadge =
  | "GPS verified · Photo proof · OLC pending claim"
  | "GPS verified · Photo proof · OLC claimed";

export type FeedPost = {
  id: string;
  completionId: string;
  questId: string;
  questTitle: string;
  region: string;
  photoDataUrl: string;
  caption: string;
  olcEarned: number;
  createdAt: string; // ISO
  badge: FeedPostBadge;
  txHash?: string;
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadCompletions(): Completion[] {
  if (typeof window === "undefined") return [];
  const list = safeParse<Completion[]>(localStorage.getItem(scopedStorageKey(COMPLETIONS_STORAGE_KEY)), []);
  return Array.isArray(list) ? list : [];
}

export function loadPosts(): FeedPost[] {
  if (typeof window === "undefined") return [];
  const list = safeParse<FeedPost[]>(localStorage.getItem(scopedStorageKey(POSTS_STORAGE_KEY)), []);
  return Array.isArray(list) ? list : [];
}

export function loadClaimedIds(): string[] {
  if (typeof window === "undefined") return [];
  const list = safeParse<string[]>(localStorage.getItem(scopedStorageKey(CLAIMS_STORAGE_KEY)), []);
  return Array.isArray(list) ? list : [];
}

export function saveCompletions(list: Completion[]): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(scopedStorageKey(COMPLETIONS_STORAGE_KEY), JSON.stringify(list));
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof DOMException && e.name === "QuotaExceededError"
        ? "Storage full — try a smaller photo or clear old posts."
        : "Could not save completion.";
    return { ok: false, error: msg };
  }
}

export function savePosts(list: FeedPost[]): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(scopedStorageKey(POSTS_STORAGE_KEY), JSON.stringify(list));
    return { ok: true };
  } catch (e) {
    const msg =
      e instanceof DOMException && e.name === "QuotaExceededError"
        ? "Storage full — try a smaller photo or clear old posts."
        : "Could not save feed post.";
    return { ok: false, error: msg };
  }
}

function saveClaimedIds(ids: string[]): void {
  try {
    localStorage.setItem(scopedStorageKey(CLAIMS_STORAGE_KEY), JSON.stringify(ids));
  } catch {
    /* ignore quota for id list */
  }
}

export function hasCompletedQuest(questId: string, completions = loadCompletions()): boolean {
  return completions.some((c) => c.questId === questId);
}

export function totalPendingOlC(completions = loadCompletions()): number {
  return completions
    .filter((c) => c.status === "pending_claim")
    .reduce((sum, c) => sum + (c.olcEarned || 0), 0);
}

export function totalClaimedOlC(completions = loadCompletions()): number {
  return completions
    .filter((c) => c.status === "claimed")
    .reduce((sum, c) => sum + (c.olcEarned || 0), 0);
}

export function pendingCompletions(completions = loadCompletions()): Completion[] {
  return completions.filter((c) => c.status === "pending_claim");
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export type RecordCheckInInput = {
  quest: Quest;
  lat: number;
  lng: number;
  distanceM: number;
  photoDataUrl: string;
  caption: string;
};

/**
 * Persist completion + feed post. Rewards start as pending_claim until claim API succeeds.
 */
export function recordCheckIn(
  input: RecordCheckInInput,
): { ok: true; completion: Completion; post: FeedPost } | { ok: false; error: string } {
  const completion: Completion = {
    id: makeId("cmp"),
    questId: input.quest.id,
    completedAt: new Date().toISOString(),
    lat: input.lat,
    lng: input.lng,
    distanceM: Math.round(input.distanceM),
    photoDataUrl: input.photoDataUrl,
    caption: input.caption.trim().slice(0, 280),
    olcEarned: input.quest.rewardOlC,
    status: "pending_claim",
  };

  const post: FeedPost = {
    id: makeId("post"),
    completionId: completion.id,
    questId: input.quest.id,
    questTitle: input.quest.title,
    region: input.quest.region,
    photoDataUrl: input.photoDataUrl,
    caption: completion.caption,
    olcEarned: completion.olcEarned,
    createdAt: completion.completedAt,
    badge: "GPS verified · Photo proof · OLC pending claim",
  };

  const completions = [completion, ...loadCompletions()];
  const posts = [post, ...loadPosts()];

  const cRes = saveCompletions(completions);
  if (!cRes.ok) return cRes;
  const pRes = savePosts(posts);
  if (!pRes.ok) {
    saveCompletions(completions.slice(1));
    return pRes;
  }
  return { ok: true, completion, post };
}

export type MarkClaimedInput = {
  txHash: string;
  wallet: string;
  amount?: number;
};

/**
 * Mark a completion as claimed after a real on-chain transfer (requires txHash).
 */
export function markCompletionClaimed(
  completionId: string,
  input: MarkClaimedInput,
): { ok: true; completion: Completion } | { ok: false; error: string } {
  if (!input.txHash || !/^0x[a-fA-F0-9]{64}$/.test(input.txHash)) {
    return { ok: false, error: "Invalid txHash — refusing to mark claimed without a real transaction." };
  }

  const completions = loadCompletions();
  const idx = completions.findIndex((c) => c.id === completionId);
  if (idx < 0) return { ok: false, error: "Completion not found in local ledger." };

  const next: Completion = {
    ...completions[idx],
    status: "claimed",
    txHash: input.txHash,
    claimedAt: new Date().toISOString(),
    claimedWallet: input.wallet,
    olcEarned: input.amount ?? completions[idx].olcEarned,
  };
  completions[idx] = next;
  const cRes = saveCompletions(completions);
  if (!cRes.ok) return cRes;

  const claimedIds = new Set(loadClaimedIds());
  claimedIds.add(completionId);
  saveClaimedIds(Array.from(claimedIds));

  const posts = loadPosts().map((p) =>
    p.completionId === completionId
      ? {
          ...p,
          badge: "GPS verified · Photo proof · OLC claimed" as const,
          txHash: input.txHash,
        }
      : p,
  );
  savePosts(posts);

  return { ok: true, completion: next };
}

/**
 * Compress an image File to a JPEG data URL (~maxWidth px) for localStorage.
 */
export function compressImageToDataUrl(
  file: File,
  maxWidth = 800,
  quality = 0.72,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxWidth / img.width);
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      } catch (e) {
        reject(e instanceof Error ? e : new Error("Encode failed"));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load image"));
    };
    img.src = url;
  });
}
