/**
 * Shared Adventure Feed store (MVP).
 * Same pattern as presaleOrders: in-memory + /tmp JSON persistence.
 * Document Redis/Postgres for production.
 */

import fs from "fs";
import path from "path";

export type AdventureFeedPost = {
  id: string;
  questId?: string;
  questTitle: string;
  region: string;
  caption: string;
  olcEarned: number;
  createdAt: string; // ISO
  badge: string;
  txHash?: string;
  status?: string;
  /** Compressed JPEG data URL — omitted from GET if oversized for response. */
  photoDataUrl?: string;
};

const STORE_PATH =
  process.env.ADVENTURE_FEED_PATH?.trim() ||
  path.join("/tmp", "overlandcoin-adventure-feed.json");

/** Max photoDataUrl string length (~210–225KB binary ≈ 280–300KB data URL). */
export const MAX_PHOTO_DATA_URL_CHARS = 300_000;

const MAX_POSTS = 200;
const GET_DEFAULT_LIMIT = 50;

const memory = new Map<string, AdventureFeedPost>();

let diskLoaded = false;

function loadDisk(): void {
  try {
    if (!fs.existsSync(STORE_PATH)) return;
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const rows = JSON.parse(raw) as AdventureFeedPost[];
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (row?.id) memory.set(row.id, row);
    }
  } catch {
    /* ignore corrupt MVP store */
  }
}

function ensureLoaded() {
  if (!diskLoaded) {
    loadDisk();
    diskLoaded = true;
  }
}

function persistDisk() {
  try {
    const dir = path.dirname(STORE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const rows = [...memory.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    fs.writeFileSync(STORE_PATH, JSON.stringify(rows.slice(0, MAX_POSTS), null, 2), "utf8");
  } catch {
    /* /tmp may be unavailable — memory still works */
  }
}

function sanitizeText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  // Strip tags / control chars lightly for public wall MVP
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, max);
}

function isIsoDate(s: string): boolean {
  const t = Date.parse(s);
  return Number.isFinite(t);
}

export type CreateFeedPostInput = {
  id?: string;
  questId?: string;
  questTitle?: string;
  region?: string;
  caption?: string;
  olcEarned?: number;
  createdAt?: string;
  badge?: string;
  txHash?: string;
  status?: string;
  photoDataUrl?: string;
};

export type CreateFeedPostResult =
  | { ok: true; post: AdventureFeedPost }
  | { ok: false; error: string; status?: number };

export function listFeedPosts(limit = GET_DEFAULT_LIMIT): AdventureFeedPost[] {
  ensureLoaded();
  const n = Math.min(Math.max(1, limit), MAX_POSTS);
  const rows = [...memory.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  return rows.slice(0, n).map((p) => {
    // Only include photo if reasonably small for JSON response
    if (p.photoDataUrl && p.photoDataUrl.length <= MAX_PHOTO_DATA_URL_CHARS) {
      return p;
    }
    const { photoDataUrl: _omit, ...rest } = p;
    return rest;
  });
}

export function upsertFeedPost(input: CreateFeedPostInput): CreateFeedPostResult {
  ensureLoaded();

  const questTitle = sanitizeText(input.questTitle, 120);
  if (!questTitle) {
    return { ok: false, error: "questTitle is required", status: 400 };
  }

  const region = sanitizeText(input.region, 80) || "Unknown";
  const caption = sanitizeText(input.caption, 280);
  const badge =
    sanitizeText(input.badge, 80) || "GPS verified · Photo proof";

  const olcRaw = Number(input.olcEarned);
  const olcEarned = Number.isFinite(olcRaw) ? Math.max(0, Math.min(1_000_000, Math.round(olcRaw))) : 0;

  let photoDataUrl: string | undefined;
  if (typeof input.photoDataUrl === "string" && input.photoDataUrl.length > 0) {
    if (input.photoDataUrl.length > MAX_PHOTO_DATA_URL_CHARS) {
      return {
        ok: false,
        error: `Photo too large (max ~${Math.round(MAX_PHOTO_DATA_URL_CHARS / 1024)}KB data URL). Compress and retry.`,
        status: 413,
      };
    }
    if (!input.photoDataUrl.startsWith("data:image/")) {
      return { ok: false, error: "photoDataUrl must be a data:image/… URL", status: 400 };
    }
    photoDataUrl = input.photoDataUrl;
  }

  const id =
    sanitizeText(input.id, 64) ||
    `post_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

  const createdAt =
    typeof input.createdAt === "string" && isIsoDate(input.createdAt)
      ? input.createdAt
      : new Date().toISOString();

  const questId = sanitizeText(input.questId, 64) || undefined;
  const txHash =
    typeof input.txHash === "string" && /^0x[a-fA-F0-9]{64}$/.test(input.txHash)
      ? input.txHash
      : undefined;
  const status = sanitizeText(input.status, 32) || undefined;

  const existing = memory.get(id);
  const post: AdventureFeedPost = {
    id,
    questId: questId ?? existing?.questId,
    questTitle,
    region,
    caption,
    olcEarned,
    createdAt: existing?.createdAt ?? createdAt,
    badge,
    txHash: txHash ?? existing?.txHash,
    status: status ?? existing?.status,
    photoDataUrl: photoDataUrl ?? existing?.photoDataUrl,
  };

  memory.set(id, post);

  // Cap memory
  if (memory.size > MAX_POSTS) {
    const sorted = [...memory.values()].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    memory.clear();
    for (const row of sorted.slice(0, MAX_POSTS)) memory.set(row.id, row);
  }

  persistDisk();
  return { ok: true, post };
}
