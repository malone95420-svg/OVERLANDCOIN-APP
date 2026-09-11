/**
 * Pending email signups + 6-digit verification codes (hashed, 15 min TTL).
 */

import { createHash, randomInt, timingSafeEqual } from "crypto";
import { Redis } from "@upstash/redis";
import { hasUpstashRedis } from "@/lib/auth/userStore";

const PENDING_PREFIX = "olc:signup:pending:";
const RATE_PREFIX = "olc:signup:code-rl:";
const TTL_SECONDS = 15 * 60;
const MAX_SENDS_PER_HOUR = 5;
const MAX_ATTEMPTS = 8;

export type PendingSignup = {
  email: string;
  name?: string;
  passwordHash: string;
  codeHash: string;
  attempts: number;
  createdAt: string;
};

const memoryPending = new Map<string, { row: PendingSignup; expiresAt: number }>();
const memoryRate = new Map<string, { n: number; resetAt: number }>();

function redisClient(): Redis | null {
  if (!hasUpstashRedis()) return null;
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  });
}

function normEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashVerifyCode(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function newVerifyCode(): string {
  return String(randomInt(100000, 1000000));
}

export async function allowCodeSend(email: string): Promise<boolean> {
  const key = RATE_PREFIX + normEmail(email);
  const r = redisClient();
  if (r) {
    const n = await r.incr(key);
    if (n === 1) await r.expire(key, 60 * 60);
    return n <= MAX_SENDS_PER_HOUR;
  }
  const now = Date.now();
  const row = memoryRate.get(key);
  if (!row || row.resetAt < now) {
    memoryRate.set(key, { n: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  row.n += 1;
  return row.n <= MAX_SENDS_PER_HOUR;
}

export async function savePendingSignup(input: {
  email: string;
  passwordHash: string;
  name?: string;
  code: string;
}): Promise<void> {
  const email = normEmail(input.email);
  const row: PendingSignup = {
    email,
    name: input.name?.trim() || undefined,
    passwordHash: input.passwordHash,
    codeHash: hashVerifyCode(input.code),
    attempts: 0,
    createdAt: new Date().toISOString(),
  };
  const key = PENDING_PREFIX + email;
  const r = redisClient();
  if (r) {
    await r.set(key, row, { ex: TTL_SECONDS });
    return;
  }
  memoryPending.set(key, { row, expiresAt: Date.now() + TTL_SECONDS * 1000 });
}

export async function getPendingSignup(email: string): Promise<PendingSignup | null> {
  const key = PENDING_PREFIX + normEmail(email);
  const r = redisClient();
  if (r) {
    const row = await r.get<PendingSignup>(key);
    return row && typeof row === "object" ? row : null;
  }
  const mem = memoryPending.get(key);
  if (!mem || mem.expiresAt < Date.now()) {
    memoryPending.delete(key);
    return null;
  }
  return mem.row;
}

export async function consumePendingIfCodeOk(
  email: string,
  code: string,
): Promise<PendingSignup | { error: string }> {
  const pending = await getPendingSignup(email);
  if (!pending) {
    return { error: "That code expired. Create your profile again." };
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    return { error: "Too many attempts. Request a new code." };
  }
  const guess = Buffer.from(hashVerifyCode(code), "hex");
  const expect = Buffer.from(pending.codeHash, "hex");
  const ok = guess.length === expect.length && timingSafeEqual(guess, expect);
  const key = PENDING_PREFIX + pending.email;
  const r = redisClient();
  if (!ok) {
    const next = { ...pending, attempts: pending.attempts + 1 };
    if (r) await r.set(key, next, { ex: TTL_SECONDS });
    else {
      const mem = memoryPending.get(key);
      if (mem) mem.row = next;
    }
    return { error: "That code is incorrect." };
  }
  if (r) await r.del(key);
  else memoryPending.delete(key);
  return pending;
}
