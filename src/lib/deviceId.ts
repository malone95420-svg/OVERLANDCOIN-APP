/**
 * Stable per-browser device id (NOT account-scoped).
 * Used for once-per-device quest completion + claim dedupe.
 */

export const DEVICE_ID_STORAGE_KEY = "overlandcoin.device.id.v1";

function makeUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/** Persist and return a stable device UUID on first visit. */
export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(DEVICE_ID_STORAGE_KEY)?.trim();
    if (existing && existing.length >= 8 && existing.length <= 80) {
      return existing;
    }
    const id = makeUuid();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
    return id;
  } catch {
    return makeUuid();
  }
}
