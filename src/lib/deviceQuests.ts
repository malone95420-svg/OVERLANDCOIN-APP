/**
 * Device-level quest completion ledger (NOT account-scoped).
 * Survives guest↔login / account switches on the same phone/browser.
 */

export const DEVICE_COMPLETED_QUESTS_KEY = "overlandcoin.device.completedQuests.v1";

export type DeviceQuestEntry = {
  questId: string;
  completedAt: string; // ISO
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

export function hasCompletedQuestOnDevice(questId: string): boolean {
  if (!questId) return false;
  return loadDeviceCompletedQuests().some((e) => e.questId === questId);
}

export function markQuestCompletedOnDevice(questId: string): void {
  if (typeof window === "undefined" || !questId) return;
  try {
    const list = loadDeviceCompletedQuests();
    if (list.some((e) => e.questId === questId)) return;
    list.push({ questId, completedAt: new Date().toISOString() });
    localStorage.setItem(DEVICE_COMPLETED_QUESTS_KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode */
  }
}
