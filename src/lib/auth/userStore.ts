/**
 * Email/password user directory.
 * Durable on Upstash Redis when UPSTASH_REDIS_REST_URL + TOKEN are set.
 * Otherwise in-memory (dev only — lost on cold start / multi-instance).
 */

import { Redis } from "@upstash/redis";

export type StoredUser = {
  id: string;
  email: string;
  name?: string;
  passwordHash: string;
  createdAt: string;
};

const USER_PREFIX = "olc:user:email:";
const memory = new Map<string, StoredUser>();

export function hasUpstashRedis(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim(),
  );
}

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

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  const key = USER_PREFIX + normEmail(email);
  const r = redisClient();
  if (r) {
    const row = await r.get<StoredUser>(key);
    return row ?? null;
  }
  return memory.get(key) ?? null;
}

export async function createUser(input: {
  email: string;
  passwordHash: string;
  name?: string;
}): Promise<StoredUser | { error: string }> {
  const email = normEmail(input.email);
  if (!email || !email.includes("@")) {
    return { error: "Invalid email." };
  }
  if (!hasUpstashRedis() && process.env.NODE_ENV === "production") {
    return {
      error:
        "Email auth needs Upstash Redis (UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN). Use wallet login for now.",
    };
  }
  const existing = await getUserByEmail(email);
  if (existing) return { error: "An account with that email already exists." };

  const user: StoredUser = {
    id: `email_${Buffer.from(email).toString("base64url").slice(0, 24)}`,
    email,
    name: input.name?.trim() || email.split("@")[0],
    passwordHash: input.passwordHash,
    createdAt: new Date().toISOString(),
  };

  const key = USER_PREFIX + email;
  const r = redisClient();
  if (r) {
    await r.set(key, user);
  } else {
    memory.set(key, user);
    console.warn(
      "[auth] userStore: no Upstash Redis — user saved in memory only (dev). Set UPSTASH_REDIS_REST_* for durable email auth.",
    );
  }
  return user;
}

export function emailAuthAvailable(): { ok: true } | { ok: false; reason: string } {
  if (!process.env.AUTH_SECRET?.trim()) {
    return { ok: false, reason: "AUTH_SECRET is required for email login." };
  }
  if (!hasUpstashRedis()) {
    if (process.env.NODE_ENV !== "production") {
      return { ok: true };
    }
    return {
      ok: false,
      reason:
        "Email auth needs Upstash Redis (UPSTASH_REDIS_REST_URL + TOKEN). Use wallet login, or add Upstash env vars.",
    };
  }
  return { ok: true };
}
