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
    adoptUntaggedGuestLedger(checksum, lower);
    dedupePoisonedWalletLedgers();
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
 * IDs present in the unscoped guest ledger — used to detect completions that were
 * wrongly copied into a wallet namespace via migrateGuestDataToAccount.
 */
/**
 * When the same completion id appears in multiple wallet namespaces (guest-migrate
 * leak + re-tag), keep it only for the true earner:
 * 1) completedByWallet match on a namespace, else
 * 2) guest ledger completedByWallet, else
 * 3) earliest completedAt among matching namespaces.
 */
function dedupePoisonedWalletLedgers(): void {
  if (typeof window === "undefined") return;
  try {
    const prefix = `${COMPLETIONS_STORAGE_KEY}::wallet:`;
    const buckets = new Map<
      string,
      { key: string; walletLower: string; row: Completion; idx: number }[]
    >();
    const keyLists = new Map<string, Completion[]>();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(prefix)) continue;
      const walletLower = key.slice(prefix.length).toLowerCase();
      if (!walletLower) continue;
      const list = safeParse<Completion[]>(localStorage.getItem(key), []);
      if (!Array.isArray(list)) continue;
      keyLists.set(key, list);
      list.forEach((row, idx) => {
        if (!row?.id) return;
        const arr = buckets.get(row.id) || [];
        arr.push({ key, walletLower, row, idx });
        buckets.set(row.id, arr);
      });
    }

    let guestById = new Map<string, Completion>();
    try {
      const guest = safeParse<Completion[]>(localStorage.getItem(COMPLETIONS_STORAGE_KEY), []);
      if (Array.isArray(guest)) {
        guestById = new Map(guest.filter((c) => c?.id).map((c) => [c.id, c]));
      }
    } catch {
      /* ignore */
    }

    const drop = new Map<string, Set<number>>(); // key -> idxs to remove
    for (const [id, homes] of buckets) {
      if (homes.length < 2) continue;
      const guest = guestById.get(id);
      const guestEarner = guest?.completedByWallet?.trim().toLowerCase();

      let winner = homes.find(
        (h) => h.row.completedByWallet?.trim().toLowerCase() === h.walletLower,
      );
      if (guestEarner) {
        const gWin = homes.find((h) => h.walletLower === guestEarner);
        if (gWin) winner = gWin;
      }
      if (!winner) {
        winner = [...homes].sort((a, b) =>
          String(a.row.completedAt || "").localeCompare(String(b.row.completedAt || "")),
        )[0];
      }
      for (const h of homes) {
        if (h.key === winner!.key && h.idx === winner!.idx) continue;
        // Drop clones from other namespaces (and duplicate rows in same key)
        if (h.walletLower === winner!.walletLower && h.idx === winner!.idx) continue;
        if (h.walletLower === winner!.walletLower) {
          // same wallet duplicate row
          const set = drop.get(h.key) || new Set<number>();
          set.add(h.idx);
          drop.set(h.key, set);
          continue;
        }
        const set = drop.get(h.key) || new Set<number>();
        set.add(h.idx);
        drop.set(h.key, set);
      }
    }

    for (const [key, idxs] of drop) {
      const list = keyLists.get(key);
      if (!list) continue;
      const next = list.filter((_, i) => !idxs.has(i));
      localStorage.setItem(key, JSON.stringify(next));
    }
  } catch {
    /* ignore */
  }
}

function guestCompletionIds(): Set<string> {
  const ids = new Set<string>();
  try {
    const list = safeParse<Completion[]>(localStorage.getItem(COMPLETIONS_STORAGE_KEY), []);
    if (Array.isArray(list)) {
      for (const c of list) {
        if (c && typeof c.id === "string") ids.add(c.id);
      }
    }
  } catch {
    /* ignore */
  }
  return ids;
}

/**
 * Keep only rows earned by this wallet. Untagged legacy rows are kept only when
 * they live in THIS wallet's namespace and were NOT also present on the guest
 * global ledger (guest copy leak).
 */
function selectRowsForWallet<T extends { id?: string; completedByWallet?: string }>(
  list: T[],
  checksum: string,
  walletLower: string,
  guestIds: Set<string>,
  tag: boolean,
): T[] {
  const out: T[] = [];
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const tagged = row.completedByWallet?.trim();
    if (tagged) {
      if (tagged.toLowerCase() !== walletLower) continue;
      out.push(tag ? { ...row, completedByWallet: checksum } : row);
      continue;
    }
    // Untagged: reject if this id still exists on the guest/global ledger
    // (almost always a migrateGuestDataToAccount leak onto a new wallet).
    if (typeof row.id === "string" && guestIds.has(row.id)) continue;
    if (tag) {
      out.push({ ...row, completedByWallet: checksum });
    } else {
      out.push(row);
    }
  }
  return out;
}

/**
 * One-time: copy account-scoped ledger for THIS same address into wallet namespace.
 * Never imports unscoped guest/global completions or another wallet's rows.
 * Also scrubs an existing wallet namespace that was poisoned by guest migration.
 */
function migrateLegacyLedgerToWallet(checksum: string, walletLower: string): void {
  if (typeof window === "undefined") return;
  const guestIds = guestCompletionIds();

  const migrateOne = (base: string, tagWallet: boolean) => {
    const dest = walletNamespacedKey(base, walletLower);
    try {
      const existingRaw = localStorage.getItem(dest);
      if (existingRaw) {
        // Heal poisoned wallet ledgers (guest copy + wrong re-tag).
        if (tagWallet) {
          const existing = safeParse<Completion[]>(existingRaw, []);
          if (!Array.isArray(existing)) return;
          const cleaned = selectRowsForWallet(existing, checksum, walletLower, guestIds, true);
          const healed = cleaned.filter((c) => {
            if (typeof c.id === "string" && guestIds.has(c.id)) {
              const guestList = safeParse<Completion[]>(
                localStorage.getItem(COMPLETIONS_STORAGE_KEY),
                [],
              );
              const g = Array.isArray(guestList)
                ? guestList.find((x) => x?.id === c.id)
                : undefined;
              if (!g) return true;
              // Guest row untagged or tagged to someone else → this wallet did not earn it.
              if (!g.completedByWallet) return false;
              if (g.completedByWallet.toLowerCase() !== walletLower) return false;
            }
            return true;
          });
          if (healed.length !== existing.length) {
            localStorage.setItem(dest, JSON.stringify(healed));
          }
        }
        return;
      }

      // Never read unscoped `base` — that is the guest/global leak vector.
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
      const tagged = selectRowsForWallet(list, checksum, walletLower, guestIds, true);
      if (tagged.length === 0) return;
      localStorage.setItem(dest, JSON.stringify(tagged));
    } catch {
      /* quota / private mode */
    }
  };

  migrateOne(COMPLETIONS_STORAGE_KEY, true);
  migrateOne(POSTS_STORAGE_KEY, true);
  migrateOne(CLAIMS_STORAGE_KEY, false);
}

const GUEST_ADOPTED_BY_KEY = "overlandcoin.completions.guestAdoptedBy.v1";

/**
 * Move untagged guest/global completions into a wallet namespace only when:
 * - No other wallet has already adopted the guest slate, AND
 * - Either there is no account session, or the session account IS this wallet.
 * Connecting a secondary wallet while logged in as the owner must NOT inherit guest OLC.
 */
function adoptUntaggedGuestLedger(checksum: string, walletLower: string): void {
  if (typeof window === "undefined") return;
  try {
    const prior = localStorage.getItem(GUEST_ADOPTED_BY_KEY)?.trim().toLowerCase();
    if (prior && prior !== walletLower) return;

    const accountKey = getAccountKey();
    if (accountKey && accountKey !== walletLower) return;

    const guestRaw = localStorage.getItem(COMPLETIONS_STORAGE_KEY);
    if (!guestRaw) return;
    const guestList = safeParse<Completion[]>(guestRaw, []);
    if (!Array.isArray(guestList) || guestList.length === 0) return;

    const adoptable = guestList.filter((c) => {
      if (!c || typeof c.id !== "string") return false;
      if (!c.completedByWallet) return true;
      return c.completedByWallet.toLowerCase() === walletLower;
    });
    if (adoptable.length === 0) return;

    const adoptIds = new Set(adoptable.map((c) => c.id));
    const destKey = walletNamespacedKey(COMPLETIONS_STORAGE_KEY, walletLower);
    const existing = safeParse<Completion[]>(localStorage.getItem(destKey), []);
    const have = new Set(
      (Array.isArray(existing) ? existing : []).map((c) => c?.id).filter(Boolean),
    );
    const tagged = adoptable
      .filter((c) => !have.has(c.id))
      .map((c) => ({ ...c, completedByWallet: c.completedByWallet || checksum }));
    const merged = [...tagged, ...(Array.isArray(existing) ? existing : [])];
    localStorage.setItem(destKey, JSON.stringify(merged));
    localStorage.setItem(GUEST_ADOPTED_BY_KEY, walletLower);

    const remaining = guestList.filter((c) => !adoptIds.has(c.id));
    if (remaining.length === 0) localStorage.removeItem(COMPLETIONS_STORAGE_KEY);
    else localStorage.setItem(COMPLETIONS_STORAGE_KEY, JSON.stringify(remaining));

    const guestPosts = safeParse<FeedPost[]>(localStorage.getItem(POSTS_STORAGE_KEY), []);
    if (Array.isArray(guestPosts) && guestPosts.length > 0) {
      const postDest = walletNamespacedKey(POSTS_STORAGE_KEY, walletLower);
      const existingPosts = safeParse<FeedPost[]>(localStorage.getItem(postDest), []);
      const haveP = new Set(
        (Array.isArray(existingPosts) ? existingPosts : []).map((p) => p?.id).filter(Boolean),
      );
      const adoptPosts = guestPosts.filter((p) => {
        if (!p || typeof p.id !== "string") return false;
        if (p.completionId && adoptIds.has(p.completionId)) return true;
        if (!p.completedByWallet) return Boolean(p.completionId && adoptIds.has(p.completionId));
        return p.completedByWallet.toLowerCase() === walletLower;
      });
      const taggedPosts = adoptPosts
        .filter((p) => !haveP.has(p.id))
        .map((p) => ({ ...p, completedByWallet: p.completedByWallet || checksum }));
      const mergedPosts = [...taggedPosts, ...(Array.isArray(existingPosts) ? existingPosts : [])];
      localStorage.setItem(postDest, JSON.stringify(mergedPosts));
      const adoptPostIds = new Set(adoptPosts.map((p) => p.id));
      const remainPosts = guestPosts.filter((p) => !adoptPostIds.has(p.id));
      if (remainPosts.length === 0) localStorage.removeItem(POSTS_STORAGE_KEY);
      else localStorage.setItem(POSTS_STORAGE_KEY, JSON.stringify(remainPosts));
    }
  } catch {
    /* quota / private mode */
  }
}

function filterForActiveWallet(list: Completion[]): Completion[] {
  if (currentWalletLower) {
    return list.filter((c) => {
      // Strict: only rows earned by the connected wallet.
      // Untagged legacy rows in this wallet's namespace are allowed only when
      // they are not also on the guest/global ledger (leak guard).
      if (!c.completedByWallet) {
        try {
          const guest = safeParse<Completion[]>(
            localStorage.getItem(COMPLETIONS_STORAGE_KEY),
            [],
          );
          if (Array.isArray(guest) && guest.some((g) => g?.id === c.id)) return false;
        } catch {
          /* ignore */
        }
        return true;
      }
      return c.completedByWallet.toLowerCase() === currentWalletLower;
    });
  }
  // No wallet connected: never paint another wallet's completions as yours.
  // Also never surface the unscoped guest ledger as claimable for a random viewer
  // when an account scope is active with foreign tagged rows.
  return list.filter((c) => !c.completedByWallet);
}

function filterPostsForActiveWallet(list: FeedPost[]): FeedPost[] {
  if (currentWalletLower) {
    return list.filter((p) => {
      if (!p.completedByWallet) {
        try {
          const guest = safeParse<FeedPost[]>(localStorage.getItem(POSTS_STORAGE_KEY), []);
          if (Array.isArray(guest) && guest.some((g) => g?.id === p.id)) return false;
        } catch {
          /* ignore */
        }
        return true;
      }
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

export function pendingCompletions(
  completions = loadCompletions(),
  wallet?: string | null,
): Completion[] {
  const pending = completions.filter((c) => c.status === "pending_claim");
  const want = normalizeWalletAddress(wallet ?? currentWalletChecksum);
  if (!want) return pending;
  const lower = want.toLowerCase();
  return pending.filter((c) => {
    if (!c.completedByWallet) return true;
    return c.completedByWallet.toLowerCase() === lower;
  });
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
