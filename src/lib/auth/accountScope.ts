/**
 * Namespace localStorage keys by logged-in account (wallet address or user id).
 * Guest (no session) keeps legacy unscoped keys. Cross-device sync needs Redis later.
 */

export const ACCOUNT_PROFILE_KEYS = [
  "overlandcoin.garage.vehicle.v1",
  "overlandcoin.completions.v1",
  "overlandcoin.posts.v1",
  "overlandcoin.claims.v1",
  "overlandcoin.purchases.v1",
] as const;

let currentAccountKey: string | null = null;

export function sanitizeAccountKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, "_").slice(0, 80);
}

export function getAccountKey(): string | null {
  return currentAccountKey;
}

export function setAccountKey(key: string | null): void {
  const next = key ? sanitizeAccountKey(key) : null;
  if (next === currentAccountKey) return;
  currentAccountKey = next;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("olc-account-change", { detail: next }));
  }
}

/** Scoped localStorage key for the active account, or base key for guests. */
export function scopedStorageKey(base: string, accountKey?: string | null): string {
  const k =
    accountKey === undefined
      ? currentAccountKey
      : accountKey
        ? sanitizeAccountKey(accountKey)
        : null;
  if (!k) return base;
  return `${base}::${k}`;
}

/**
 * When logging in, copy guest (unscoped) data into the account namespace if empty.
 * Same-device continuity; does not overwrite existing account data.
 */
export function migrateGuestDataToAccount(accountKey: string): void {
  if (typeof window === "undefined") return;
  const safe = sanitizeAccountKey(accountKey);
  for (const base of ACCOUNT_PROFILE_KEYS) {
    const scoped = `${base}::${safe}`;
    try {
      if (localStorage.getItem(scoped)) continue;
      const guest = localStorage.getItem(base);
      if (guest) localStorage.setItem(scoped, guest);
    } catch {
      /* quota / private mode */
    }
  }
}

export function accountKeyFromSessionUser(
  user:
    | {
        accountKey?: string | null;
        address?: string | null;
        id?: string | null;
        email?: string | null;
      }
    | null
    | undefined,
): string | null {
  if (!user) return null;
  if (user.accountKey) return sanitizeAccountKey(user.accountKey);
  if (user.address) return sanitizeAccountKey(user.address);
  if (user.id) return sanitizeAccountKey(user.id);
  if (user.email) return sanitizeAccountKey(`email:${user.email}`);
  return null;
}
