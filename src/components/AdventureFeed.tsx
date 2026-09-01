"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadPosts, type FeedPost } from "@/lib/completions";

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export function AdventureFeed() {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setPosts(loadPosts());
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return <div className="card text-sm text-slate-500">Loading feed…</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="card space-y-3 text-center">
        <p className="text-slate-300">No adventure posts yet.</p>
        <p className="text-sm text-slate-500">
          Complete a quest on the map with GPS + photo and it will show here (stored in this
          browser).
        </p>
        <Link href="/map" className="btn-primary inline-flex !text-xs">
          Open Quest Map
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-xl gap-6">
      {posts.map((p) => (
        <article key={p.id} className="overflow-hidden rounded-2xl border border-border bg-bg-card shadow-gold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.photoDataUrl} alt={p.questTitle} className="aspect-[4/3] w-full object-cover" />
          <div className="space-y-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-white">{p.questTitle}</h2>
              <span className="text-xs text-slate-500">{timeAgo(p.createdAt)}</span>
            </div>
            <p className="text-xs text-slate-500">{p.region}</p>
            {p.caption ? <p className="text-sm text-slate-300">{p.caption}</p> : null}
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
