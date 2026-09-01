/**
 * Server-side anti-double-claim ledger for quest reward payouts.
 *
 * MVP: in-memory Map + optional JSON file under /tmp (and data/ when writable).
 * Production should use Redis or a durable DB — serverless instances do not share memory.
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
};

const memory = new Map<string, ClaimLedgerEntry>();

const TMP_LEDGER = "/tmp/overlandcoin-claims-ledger.json";
const DATA_LEDGER = path.join(process.cwd(), "data", "claims-ledger.json");

let hydrated = false;

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

export async function recordClaim(entry: ClaimLedgerEntry): Promise<void> {
  await hydrate();
  memory.set(entry.completionId, entry);
  await persist();
}
