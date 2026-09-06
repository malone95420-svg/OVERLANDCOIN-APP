/**
 * Legacy device-level quest completion ledger (NOT wallet-scoped).
 *
 * Historically used to “seal” completions onto a phone/browser so account
 * switches could not re-earn. That leaked “completed” UI across wallets on
 * the same device — fixed: UI eligibility is per wallet in completions.ts.
 *
 * These helpers remain for optional soft fraud analytics only. Do NOT use
 * them to paint a different wallet’s quests as completed.
 */

export const DEVICE_COMPLETED_QUESTS_KEY = "overlandcoin.device.completedQuests.v1";

export type DeviceQuestEntry = {
  questId: string;
  completedAt: string; // ISO
  /** Optional: wallet that completed (when recorded after the per-wallet fix). */
  completedByWallet?: string;
};

function safeParseEntries(raw: string | null): DeviceQuestEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: DeviceQuestEntry[] = [];
    for (const item of parsed) {
      if (typeof item === "string" && item) {
        out.push({ questId: item, completedAt: "" });
      } else if (
        item &&
        typeof item === "object" &&
        typeof (item as DeviceQuestEntry).questId === "string" &&
        (item as DeviceQuestEntry).questId
      ) {
        const e = item as DeviceQuestEntry;
        out.push({
          questId: e.questId,
          completedAt: typeof e.completedAt === "string" ? e.completedAt : "",
          completedByWallet:
            typeof e.completedByWallet === "string" ? e.completedByWallet : undefined,
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function loadDeviceCompletedQuests(): DeviceQuestEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return safeParseEntries(localStorage.getItem(DEVICE_COMPLETED_QUESTS_KEY));
  } catch {
    return [];
  }
}

/** @deprecated Do not gate UI completion on this — use hasCompletedQuest (wallet ledger). */
export function hasCompletedQuestOnDevice(questId: string): boolean {
  if (!questId) return false;
  return loadDeviceCompletedQuests().some((e) => e.questId === questId);
}

/**
 * Optional soft record for analytics. Does not affect UI “completed” state.
 */
export function markQuestCompletedOnDevice(
  questId: string,
  completedByWallet?: string | null,
): void {
  if (typeof window === "undefined" || !questId) return;
  try {
    const list = loadDeviceCompletedQuests();
    const wallet = completedByWallet?.trim() || undefined;
    const existing = list.find((e) => e.questId === questId);
    if (existing) {
      if (wallet && !existing.completedByWallet) {
        existing.completedByWallet = wallet;
        localStorage.setItem(DEVICE_COMPLETED_QUESTS_KEY, JSON.stringify(list));
      }
      return;
    }
    list.push({
      questId,
      completedAt: new Date().toISOString(),
      ...(wallet ? { completedByWallet: wallet } : {}),
    });
    localStorage.setItem(DEVICE_COMPLETED_QUESTS_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode */
  }
}
