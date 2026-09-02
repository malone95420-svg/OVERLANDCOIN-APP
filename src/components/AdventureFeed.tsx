"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadPosts, type FeedPost } from "@/lib/completions";

type ServerPost = {
  id: string;
  questId?: string;
  questTitle: string;
  region: string;
  caption: string;
  olcEarned: number;
  createdAt: string;
  badge: string;
  txHash?: string;
  photoDataUrl?: string;
};

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function mergePosts(server: ServerPost[], local: FeedPost[]): FeedPost[] {
  const byId = new Map<string, FeedPost>();
  // Server first
  for (const p of server) {
    byId.set(p.id, {
      id: p.id,
      completionId: p.id,
      questId: p.questId ?? "",
      questTitle: p.questTitle,
      region: p.region,
      photoDataUrl: p.photoDataUrl ?? "",
      caption: p.caption ?? "",
      olcEarned: p.olcEarned ?? 0,
      createdAt: p.createdAt,
      badge: (p.badge as FeedPost["badge"]) || "GPS verified · Photo proof",
      txHash: p.txHash,
    });
  }
  // Local fills gaps / adds offline posts (do not overwrite server)
  for (const p of local) {
    if (!byId.has(p.id)) byId.set(p.id, p);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function AdventureFeed() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const local = loadPosts();

    (async () => {
      try {
        const res = await fetch("/api/feed?limit=50", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Feed unavailable (${res.status})`);
        }
        const data = (await res.json()) as { posts?: ServerPost[] };
        const server = Array.isArray(data.posts) ? data.posts : [];
        if (!cancelled) {
          setPosts(mergePosts(server, local));
          setLoadError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setPosts(local);
          setLoadError(
            e instanceof Error ? e.message : "Could not load shared feed — showing local posts.",
          );
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!hydrated) {
    return <div className="card w-full text-sm text-slate-500">Loading feed…</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="card w-full max-w-full space-y-3 text-center">
        <p className="text-slate-300">No adventures on the wall yet.</p>
        <p className="text-sm text-slate-500">
          Complete a quest on the map with GPS + photo proof — your check-in will appear here for
          everyone.
        </p>
        {loadError ? <p className="text-xs text-amber-400">{loadError}</p> : null}
        <Link href="/map" className="btn-primary inline-flex !text-xs">
          Open Quest Map
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-xl gap-6 overflow-x-hidden">
      {loadError ? (
        <p className="text-center text-xs text-amber-400">{loadError}</p>
      ) : null}
      {posts.map((p) => (
        <article
          key={p.id}
          className="w-full max-w-full overflow-hidden rounded-2xl border border-border bg-bg-card shadow-gold"
        >
          {p.photoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.photoDataUrl}
              alt={p.questTitle}
              className="aspect-[4/3] h-auto w-full max-w-full object-cover"
            />
          ) : (
            <div className="flex aspect-[4/3] w-full items-center justify-center bg-bg-panel text-sm text-slate-500">
              Photo proof on file
            </div>
          )}
          <div className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="break-words font-semibold text-white">{p.questTitle}</h2>
              <span className="shrink-0 text-xs text-slate-500">{timeAgo(p.createdAt)}</span>
            </div>
            <p className="text-xs text-slate-500">{p.region}</p>
            {p.caption ? <p className="break-words text-sm text-slate-300">{p.caption}</p> : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-sm font-semibold text-gold-bright">+{p.olcEarned} OLC</span>
              <span className="badge !text-[10px]">{p.badge}</span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
