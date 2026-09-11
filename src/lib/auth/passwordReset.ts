/**
 * Single-use password reset tokens.
 * Stored hashed (sha256) in Redis with a 1h TTL, or in memory in local dev.
 */

import { createHash, randomBytes } from "crypto";
import { Redis } from "@upstash/redis";
import { hasUpstashRedis } from "@/lib/auth/userStore";

const TOKEN_PREFIX = "olc:pwreset:";
const RATE_PREFIX = "olc:pwreset:rl:";
const TTL_SECONDS = 60 * 60;
const MAX_PER_HOUR = 5;

type ResetRecord = { email: string; createdAt: string };

const memoryTokens = new Map<string, { email: string; expiresAt: number }>();
const memoryRate = new Map<string, { n: number; resetAt: number }>();

function redisClient(): Redis | null {
  if (!hasUpstashRedis()) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newResetToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function allowForgotRequest(email: string): Promise<boolean> {
  const key = RATE_PREFIX + email.trim().toLowerCase();
  const r = redisClient();
  if (r) {
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, TTL_SECONDS);
    return n <= MAX_PER_HOUR;
  }
  const now = Date.now();
  const row = memoryRate.get(key);
  if (!row || row.resetAt < now) {
    memoryRate.set(key, { n: 1, resetAt: now + TTL_SECONDS * 1000 });
    return true;
  }
  row.n += 1;
  return row.n <= MAX_PER_HOUR;
}

export async function saveResetToken(email: string, token: string): Promise<void> {
  const hashed = hashResetToken(token);
  const key = TOKEN_PREFIX + hashed;
  const r = redisClient();
  const record: ResetRecord = { email: email.trim().toLowerCase(), createdAt: new Date().toISOString() };
  if (r) {
    await r.set(key, record, { ex: TTL_SECONDS });
    return;
  }
  memoryTokens.set(key, { email: record.email, expiresAt: Date.now() + TTL_SECONDS * 1000 });
}

export async function consumeResetToken(token: string): Promise<string | null> {
  const raw = token.trim();
  if (raw.length < 16) return null;
  const key = TOKEN_PREFIX + hashResetToken(raw);
  const r = redisClient();
  if (r) {
    const row = await r.get<ResetRecord>(key);
    if (row) await r.del(key);
    const email = row && typeof row === "object" ? row.email : null;
    return email || null;
  }
  const row = memoryTokens.get(key);
  memoryTokens.delete(key);
  if (!row || row.expiresAt < Date.now()) return null;
  return row.email;
}
