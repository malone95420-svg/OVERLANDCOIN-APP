/**
 * Server-side anti-double-claim ledger for quest reward payouts.
 *
 * Keys tracked (MVP in-memory + optional JSON under /tmp):
 * - completionId
 * - wallet:questId  (lowercased wallet)
 * - deviceId:questId (when client sends deviceId)
 *
 * LIMITATION (serverless MVP): memory is per-instance and resets on cold start.
 * /tmp persistence helps within one machine but does NOT sync across Vercel
 * instances. Production should use Redis or a durable DB.
 */

import { promises as fs } from "fs";
import path from "path";

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
  return memory.has(completionId);
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

/** Prefer blocking wallet+questId AND deviceId+questId when provided. */
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

  if (input.deviceId?.trim()) {
    const byDevice = await findClaimByDeviceQuest(input.deviceId, input.questId);
    if (byDevice) return { reason: "device_quest", entry: byDevice };
  }

  return null;
}

export async function recordClaim(entry: ClaimLedgerEntry): Promise<void> {
  await hydrate();
  memory.set(entry.completionId, entry);
  indexEntry(entry);
  await persist();
}
