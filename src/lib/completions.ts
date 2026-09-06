/**
 * Quest completions + adventure feed posts (localStorage).
 * OLC starts as pending_claim; claim via POST /api/rewards/claim sets status claimed + txHash.
 *
 * Completion UI / check-in eligibility is per connected wallet (checksummed 0x…).
 * Device-sealed IDs must NOT mark a different wallet as completed.
 */

import { getAddress, isAddress } from "viem";

import type { Quest } from "@/data/quests";

import { getAccountKey, scopedStorageKey } from "@/lib/auth/accountScope";

export const COMPLETIONS_STORAGE_KEY = "overlandcoin.completions.v1";
export const POSTS_STORAGE_KEY = "overlandcoin.posts.v1";
/** Client-side claimed completion ids (mirrors server ledger for UX / anti-double-claim). */
export const CLAIMS_STORAGE_KEY = "overlandcoin.claims.v1";

export const WALLET_CHANGE_EVENT = "olc-wallet-change";

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
  /** Checksummed 0x… wallet that earned this completion (per-wallet slate). */
  completedByWallet?: string;
};

export type FeedPostBadge =
  | "GPS verified · Photo proof"
  | "GPS verified · Photo proof · OLC sent";

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
  completedByWallet?: string;
};

/** Active connected wallet (lowercased) for ledger namespacing. */
let currentWalletLower: string | null = null;
/** Checksummed form of currentWalletLower when set. */
let currentWalletChecksum: string | null = null;

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Normalize to checksummed 0x… or null. */
export function normalizeWalletAddress(address: string | null | undefined): string | null {
  if (!address) return null;
  const raw = address.trim();
  if (!isAddress(raw)) return null;
  try {
    return getAddress(raw);
  } catch {
    return null;
  }
}

export function getCompletionsWallet(): string | null {
  return currentWalletChecksum;
}

/**
 * Bind the completions ledger to the connected wagmi wallet.
 * Switching wallets loads that wallet's slate (not device-sealed history).
 */
export function setCompletionsWallet(address: string | null | undefined): void {
  const checksum = normalizeWalletAddress(address);
  const lower = checksum ? checksum.toLowerCase() : null;
  if (lower === currentWalletLower) return;
  currentWalletLower = lower;
  currentWalletChecksum = checksum;
  if (checksum && lower) {
    migrateLegacyLedgerToWallet(checksum, lower);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(WALLET_CHANGE_EVENT, { detail: checksum }));
  }
}

function walletNamespacedKey(base: string, walletLower: string): string {
  return `${base}::wallet:${walletLower}`;
}

/**
 * Storage key for completions/posts/claims:
 * - Connected wallet → `base::wallet:0x…` (per-wallet)
 * - No wallet → account/guest scope (legacy); callers filter other wallets out
 */
function ledgerKey(base: string): string {
  if (currentWalletLower) {
    return walletNamespacedKey(base, currentWalletLower);
  }
  return scopedStorageKey(base);
}

function readRawList<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  const list = safeParse<T[]>(localStorage.getItem(key), []);
  return Array.isArray(list) ? list : [];
}

/**
 * One-time: copy account-scoped ledger for THIS same address into wallet namespace.
 * Does NOT import device-sealed quest IDs or another wallet's data.
 */
function migrateLegacyLedgerToWallet(checksum: string, walletLower: string): void {
  if (typeof window === "undefined") return;

  const migrateOne = (base: string, tagWallet: boolean) => {
    const dest = walletNamespacedKey(base, walletLower);
    try {
      if (localStorage.getItem(dest)) return;

      const candidates: string[] = [
        `${base}::${walletLower}`,
        scopedStorageKey(base, walletLower),
      ];
      const accountKey = getAccountKey();
      if (accountKey && accountKey === walletLower) {
        candidates.unshift(scopedStorageKey(base, accountKey));
      }

      let raw: string | null = null;
      for (const k of candidates) {
        try {
          const v = localStorage.getItem(k);
          if (v) {
            raw = v;
            break;
          }
        } catch {
          /* ignore */
        }
      }
      if (!raw) return;

      if (!tagWallet) {
        localStorage.setItem(dest, raw);
        return;
      }

      const list = safeParse<Completion[]>(raw, []);
      if (!Array.isArray(list) || list.length === 0) return;
      const tagged = list.map((c) => ({
        ...c,
        completedByWallet: c.completedByWallet || checksum,
        claimedWallet: c.claimedWallet,
      }));
      localStorage.setItem(dest, JSON.stringify(tagged));
    } catch {
      /* quota / private mode */
    }
  };

  migrateOne(COMPLETIONS_STORAGE_KEY, true);
  migrateOne(POSTS_STORAGE_KEY, true);
  migrateOne(CLAIMS_STORAGE_KEY, false);
}

function filterForActiveWallet(list: Completion[]): Completion[] {
  if (currentWalletLower) {
    return list.filter((c) => {
      if (!c.completedByWallet) return true; // legacy row in this wallet namespace
      return c.completedByWallet.toLowerCase() === currentWalletLower;
    });
  }
  // No wallet connected: never paint another wallet's completions as yours.
  return list.filter((c) => !c.completedByWallet);
}

function filterPostsForActiveWallet(list: FeedPost[]): FeedPost[] {
  if (currentWalletLower) {
    return list.filter((p) => {
      if (!p.completedByWallet) return true;
      return p.completedByWallet.toLowerCase() === currentWalletLower;
    });
  }
  return list.filter((p) => !p.completedByWallet);
}

export function loadCompletions(): Completion[] {
  if (typeof window === "undefined") return [];
  return filterForActiveWallet(readRawList<Completion>(ledgerKey(COMPLETIONS_STORAGE_KEY)));
}

export function loadPosts(): FeedPost[] {
  if (typeof window === "undefined") return [];
  return filterPostsForActiveWallet(readRawList<FeedPost>(ledgerKey(POSTS_STORAGE_KEY)));
}

export function loadClaimedIds(): string[] {
  if (typeof window === "undefined") return [];
  const list = readRawList<string>(ledgerKey(CLAIMS_STORAGE_KEY));
  return list.filter((id) => typeof id === "string");
}

export function saveCompletions(list: Completion[]): { ok: true } | { ok: false; error: string } {
  try {
    localStorage.setItem(ledgerKey(COMPLETIONS_STORAGE_KEY), JSON.stringify(list));
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
    localStorage.setItem(ledgerKey(POSTS_STORAGE_KEY), JSON.stringify(list));
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
    localStorage.setItem(ledgerKey(CLAIMS_STORAGE_KEY), JSON.stringify(ids));
  } catch {
    /* ignore quota for id list */
  }
}

/**
 * UI “completed” / check-in eligibility — per connected wallet ledger only.
 * Never consults device-sealed IDs (those leaked across wallet switches).
 */
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
  /** Connected wallet — namespaces the completion to this address. */
  wallet?: string | null;
};

/**
 * Persist completion + feed post. Rewards start as pending_claim until claim API succeeds.
 * Eligibility is per-wallet (or guest when no wallet); device seal is not used.
 */
export function recordCheckIn(
  input: RecordCheckInInput,
): { ok: true; completion: Completion; post: FeedPost } | { ok: false; error: string } {
  const wallet = normalizeWalletAddress(input.wallet ?? currentWalletChecksum);
  if (wallet && currentWalletLower !== wallet.toLowerCase()) {
    setCompletionsWallet(wallet);
  }

  if (loadCompletions().some((c) => c.questId === input.quest.id)) {
    return {
      ok: false,
      error: wallet
        ? "Already completed for this wallet"
        : "Already completed — connect a wallet or finish guest check-in claim first",
    };
  }

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
    ...(wallet ? { completedByWallet: wallet } : {}),
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
    badge: "GPS verified · Photo proof",
    ...(wallet ? { completedByWallet: wallet } : {}),
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

  const wallet = normalizeWalletAddress(input.wallet);
  if (!wallet) {
    return { ok: false, error: "Invalid wallet address." };
  }

  const completions = loadCompletions();
  const idx = completions.findIndex((c) => c.id === completionId);
  if (idx < 0) return { ok: false, error: "Completion not found in local ledger." };

  const next: Completion = {
    ...completions[idx],
    status: "claimed",
    txHash: input.txHash,
    claimedAt: new Date().toISOString(),
    claimedWallet: wallet,
    completedByWallet: completions[idx].completedByWallet || wallet,
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
          badge: "GPS verified · Photo proof · OLC sent" as const,
          txHash: input.txHash,
          completedByWallet: p.completedByWallet || wallet,
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

/**
 * Fire-and-forget publish to the shared Adventure Feed API.
 * Local save remains authoritative if this fails.
 */
export async function publishFeedPostToServer(
  post: FeedPost,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/feed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: post.id,
        questId: post.questId,
        questTitle: post.questTitle,
        region: post.region,
        caption: post.caption,
        olcEarned: post.olcEarned,
        photoDataUrl: post.photoDataUrl,
        createdAt: post.createdAt,
        badge: post.badge,
        txHash: post.txHash,
      }),
    });
    if (!res.ok) {
      let msg = `Feed sync failed (${res.status})`;
      try {
        const data = (await res.json()) as { error?: string };
        if (data?.error) msg = data.error;
      } catch {
        /* ignore */
      }
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Feed sync network error",
    };
  }
}
