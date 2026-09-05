/**
 * Local affiliate referral codes (browser). Stable per account/wallet/guest device.
 * Server-backed referral tracking is not wired yet — stats stay honest zeros.
 */

import { sanitizeAccountKey } from "@/lib/auth/accountScope";
import { SITE } from "@/lib/site";

export const AFFILIATE_CODE_KEY = "overlandcoin.affiliateCode.v1";
export const AFFILIATE_STATS_KEY = "overlandcoin.affiliateStats.v1";

function hashToCode(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = (h >>> 0).toString(36).toUpperCase().padStart(8, "0").slice(0, 8);
  return `OLC${n}`;
}

/** Stable referral code for the current identity (accountKey, wallet, or guest). */
export function getOrCreateAffiliateCode(identity?: string | null): string {
  if (typeof window === "undefined") return "OLC00000000";
  const seed = identity?.trim()
    ? sanitizeAccountKey(identity)
    : (() => {
        try {
          let guest = localStorage.getItem("overlandcoin.affiliateGuestSeed.v1");
          if (!guest) {
            guest = `guest_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
            localStorage.setItem("overlandcoin.affiliateGuestSeed.v1", guest);
          }
          return guest;
        } catch {
          return `guest_fallback`;
        }
      })();

  const storageKey = identity?.trim()
    ? `${AFFILIATE_CODE_KEY}::${sanitizeAccountKey(identity)}`
    : AFFILIATE_CODE_KEY;

  try {
    const existing = localStorage.getItem(storageKey);
    if (existing && /^OLC[A-Z0-9]{6,12}$/i.test(existing)) return existing.toUpperCase();
    const code = hashToCode(seed);
    localStorage.setItem(storageKey, code);
    return code;
  } catch {
    return hashToCode(seed);
  }
}

export function affiliateReferralUrl(code: string, origin?: string): string {
  const base =
    origin?.replace(/\/$/, "") ||
    (typeof window !== "undefined" ? window.location.origin : SITE.url);
  return `${base}/presale?ref=${encodeURIComponent(code)}`;
}

export type AffiliateStats = {
  referrals: number;
  olcEarned: number;
};

/** Honest empty stats until a backend exists — never invents earnings. */
export function loadAffiliateStats(): AffiliateStats {
  return { referrals: 0, olcEarned: 0 };
}
