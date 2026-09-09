/**
 * Server-side anti-double-claim ledger for quest reward payouts.
 *
 * Keys tracked (MVP in-memory + optional JSON under /tmp):
 * - completionId
 * - wallet:questId  (lowercased wallet)
 * - deviceId recorded for audit (NOT a hard block — claims are per wallet)
 *
 * LIMITATION (serverless MVP): memory is per-instance and resets on cold start.
 * /tmp persistence helps within one machine but does NOT sync across Vercel
 * instances. Production should use Redis or a durable DB.
 */

import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { hasUpstashRedis } from "@/lib/auth/userStore";

export type ClaimLedgerEntry = {
  completionId: string;
  questId: string;
  wallet: string;
  amount: number;
  txHash: string;
  claimedAt: string;
  deviceId?: string;
};

const memory = new Map<string, ClaimLedgerEntry>();
/** Secondary indexes: wallet:questId and device:questId → completionId */
const walletQuestIndex = new Map<string, string>();
const deviceQuestIndex = new Map<string, string>();

const TMP_LEDGER = "/tmp/overlandcoin-claims-ledger.json";
const DATA_LEDGER = path.join(process.cwd(), "data", "claims-ledger.json");

const CLAIM_REDIS_PREFIX = "olc:claim:";
const CLAIM_REDIS_TTL = 30 * 24 * 60 * 60; // 30 days

function claimsRedis(): Redis | null {
  if (!hasUpstashRedis()) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

let hydrated = false;

function walletQuestKey(wallet: string, questId: string): string {
  return `w:${wallet.trim().toLowerCase()}:${questId}`;
}

function deviceQuestKey(deviceId: string, questId: string): string {
  return `d:${deviceId.trim()}:${questId}`;
}

function indexEntry(entry: ClaimLedgerEntry): void {
  if (entry.wallet && entry.questId) {
    walletQuestIndex.set(walletQuestKey(entry.wallet, entry.questId), entry.completionId);
  }
  if (entry.deviceId && entry.questId) {
    deviceQuestIndex.set(deviceQuestKey(entry.deviceId, entry.questId), entry.completionId);
  }
}

async function tryRead(filePath: string): Promise<ClaimLedgerEntry[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as ClaimLedgerEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const fromTmp = await tryRead(TMP_LEDGER);
  const fromData = await tryRead(DATA_LEDGER);
  for (const e of [...fromData, ...fromTmp]) {
    if (e?.completionId && !memory.has(e.completionId)) {
      memory.set(e.completionId, e);
      indexEntry(e);
    }
  }
}

async function persist(): Promise<void> {
  const list = Array.from(memory.values());
  const body = JSON.stringify(list, null, 2);
  try {
    await fs.writeFile(TMP_LEDGER, body, "utf8");
  } catch {
    /* /tmp may be unavailable in some runtimes */
  }
  try {
    await fs.mkdir(path.dirname(DATA_LEDGER), { recursive: true });
    await fs.writeFile(DATA_LEDGER, body, "utf8");
  } catch {
    /* Vercel/serverless FS is often read-only outside /tmp */
  }
}

export async function isCompletionClaimed(completionId: string): Promise<boolean> {
  await hydrate();
  if (memory.has(completionId)) return true;
  const r = claimsRedis();
  if (r) {
    try {
      return Boolean(await r.get(`${CLAIM_REDIS_PREFIX}${completionId}`));
    } catch {
      /* ignore — fall back to in-memory */
    }
  }
  return false;
}

export async function getClaim(completionId: string): Promise<ClaimLedgerEntry | undefined> {
  await hydrate();
  return memory.get(completionId);
}

export async function findClaimByWalletQuest(
  wallet: string,
  questId: string,
): Promise<ClaimLedgerEntry | undefined> {
  await hydrate();
  const id = walletQuestIndex.get(walletQuestKey(wallet, questId));
  return id ? memory.get(id) : undefined;
}

export async function findClaimByDeviceQuest(
  deviceId: string,
  questId: string,
): Promise<ClaimLedgerEntry | undefined> {
  await hydrate();
  if (!deviceId.trim()) return undefined;
  const id = deviceQuestIndex.get(deviceQuestKey(deviceId, questId));
  return id ? memory.get(id) : undefined;
}

export type ClaimConflict =
  | { reason: "completion"; entry: ClaimLedgerEntry }
  | { reason: "wallet_quest"; entry: ClaimLedgerEntry }
  | { reason: "device_quest"; entry: ClaimLedgerEntry };

/** Block duplicate completionId, wallet+questId, and deviceId+questId. */
export async function findClaimConflict(input: {
  completionId: string;
  questId: string;
  wallet: string;
  deviceId?: string;
}): Promise<ClaimConflict | null> {
  await hydrate();
  const byCompletion = memory.get(input.completionId);
  if (byCompletion) return { reason: "completion", entry: byCompletion };

  const byWallet = await findClaimByWalletQuest(input.wallet, input.questId);
  if (byWallet) return { reason: "wallet_quest", entry: byWallet };

  if (input.deviceId) {
    const byDevice = await findClaimByDeviceQuest(input.deviceId, input.questId);
    if (byDevice) return { reason: "device_quest", entry: byDevice };
  }

  // Durable cross-instance check (Upstash Redis when configured).
  const r = claimsRedis();
  if (r) {
    try {
      const byCompletionD = await r.get<ClaimLedgerEntry>(
        `${CLAIM_REDIS_PREFIX}${input.completionId}`,
      );
      if (byCompletionD?.completionId) {
        return { reason: "completion", entry: byCompletionD };
      }
      const byWalletD = await r.get<ClaimLedgerEntry>(
        `${CLAIM_REDIS_PREFIX}${walletQuestKey(input.wallet, input.questId)}`,
      );
      if (byWalletD?.completionId) {
        return { reason: "wallet_quest", entry: byWalletD };
      }
      if (input.deviceId) {
        const byDeviceD = await r.get<ClaimLedgerEntry>(
          `${CLAIM_REDIS_PREFIX}${deviceQuestKey(input.deviceId, input.questId)}`,
        );
        if (byDeviceD?.completionId) {
          return { reason: "device_quest", entry: byDeviceD };
        }
      }
    } catch {
      /* Redis read failed — rely on in-memory */
    }
  }

  return null;
}

/**
 * In-process reservation so two concurrent requests on the same instance cannot both
 * pass findClaimConflict before either is recorded. Cross-instance durability still
 * requires Redis/DB (see README) — this only closes the same-instance race.
 */
const inFlightKeys = new Set<string>();

function claimConflictKeys(input: {
  completionId: string;
  questId: string;
  wallet: string;
  deviceId?: string;
}): string[] {
  const keys = [input.completionId, walletQuestKey(input.wallet, input.questId)];
  if (input.deviceId) keys.push(deviceQuestKey(input.deviceId, input.questId));
  return keys;
}

export function tryReserveClaim(input: {
  completionId: string;
  questId: string;
  wallet: string;
  deviceId?: string;
}): boolean {
  const keys = claimConflictKeys(input);
  if (keys.some((k) => inFlightKeys.has(k))) return false;
  keys.forEach((k) => inFlightKeys.add(k));
  return true;
}

export function releaseClaimReservation(input: {
  completionId: string;
  questId: string;
  wallet: string;
  deviceId?: string;
}): void {
  for (const k of claimConflictKeys(input)) inFlightKeys.delete(k);
}

export async function recordClaim(entry: ClaimLedgerEntry): Promise<void> {
  await hydrate();
  memory.set(entry.completionId, entry);
  indexEntry(entry);
  await persist();

  // Durable cross-instance record (Upstash Redis when configured).
  const r = claimsRedis();
  if (r) {
    const body = JSON.stringify(entry);
    const opts = { ex: CLAIM_REDIS_TTL };
    void r.set(`${CLAIM_REDIS_PREFIX}${entry.completionId}`, body, opts).catch(() => {});
    void r
      .set(`${CLAIM_REDIS_PREFIX}${walletQuestKey(entry.wallet, entry.questId)}`, body, opts)
      .catch(() => {});
    if (entry.deviceId) {
      void r
        .set(`${CLAIM_REDIS_PREFIX}${deviceQuestKey(entry.deviceId, entry.questId)}`, body, opts)
        .catch(() => {});
    }
    // Durable running total of OLC claimed (best-effort counter for the admin overview).
    void r.incrbyfloat("olc:stats:claimed-total", entry.amount).catch(() => {});
  }
}

/** Sum of OLC claimed in this instance (in-memory fallback for the overview). */
export function getInMemoryClaimedOlc(): number {
  let sum = 0;
  for (const e of memory.values()) {
    if (typeof e.amount === "number" && Number.isFinite(e.amount)) {
      sum += e.amount;
    }
  }
  return sum;
}

/** Total OLC paid out in quest claims (durable Redis counter when available). */
export async function getTotalClaimedOlc(): Promise<number> {
  const r = claimsRedis();
  if (r) {
    try {
      const v = await r.get<string>("olc:stats:claimed-total");
      if (v != null) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
    } catch {
      /* fall back to in-memory */
    }
  }
  return getInMemoryClaimedOlc();
}
