/**
 * GET/POST /api/feed — public Adventure Feed wall (MVP).
 * Storage: in-memory + /tmp (see adventureFeedStore.ts).
 */

import { NextRequest, NextResponse } from "next/server";
import { listFeedPosts, upsertFeedPost } from "@/lib/adventureFeedStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 12;
const rateBuckets = new Map<string, number[]>();

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const prev = rateBuckets.get(ip) ?? [];
  const recent = prev.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(ip, recent);
    return false;
  }
  recent.push(now);
  rateBuckets.set(ip, recent);
  return true;
}

export async function GET(req: NextRequest) {
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : 50;
  const posts = listFeedPosts(Number.isFinite(limit) ? limit : 50);
  return NextResponse.json({ posts });
}

export async function POST(req: NextRequest) {
  if (!checkRateLimit(clientIp(req))) {
    return NextResponse.json(
      { error: "Too many posts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = upsertFeedPost({
    id: typeof body.id === "string" ? body.id : undefined,
    questId: typeof body.questId === "string" ? body.questId : undefined,
    questTitle: typeof body.questTitle === "string" ? body.questTitle : undefined,
    region: typeof body.region === "string" ? body.region : undefined,
    caption: typeof body.caption === "string" ? body.caption : undefined,
    olcEarned: typeof body.olcEarned === "number" ? body.olcEarned : Number(body.olcEarned),
    createdAt: typeof body.createdAt === "string" ? body.createdAt : undefined,
    badge: typeof body.badge === "string" ? body.badge : undefined,
    txHash: typeof body.txHash === "string" ? body.txHash : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
    photoDataUrl: typeof body.photoDataUrl === "string" ? body.photoDataUrl : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status ?? 400 },
    );
  }

  return NextResponse.json({ ok: true, post: result.post });
}
