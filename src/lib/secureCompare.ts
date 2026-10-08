import { createHash, timingSafeEqual } from "crypto";

/**
 * Constant-time comparison for secrets (admin secrets, cron secrets, webhook tokens).
 *
 * Compares SHA-256 digests of the two values with crypto.timingSafeEqual:
 * - safe for unequal lengths (raw timingSafeEqual throws on length mismatch)
 * - leaks no information about the secret's content via response timing
 *
 * Returns false for empty strings; callers already gate on configured secrets.
 */
export function secureCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const da = createHash("sha256").update(a, "utf8").digest();
  const db = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(da, db);
}
