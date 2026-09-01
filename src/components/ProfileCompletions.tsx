"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getQuestById } from "@/lib/quests";
import {
  loadCompletions,
  totalPendingOlC,
  type Completion,
} from "@/lib/completions";

export function ProfileCompletions() {
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCompletions(loadCompletions());
    setHydrated(true);
  }, []);

  const pending = useMemo(() => totalPendingOlC(completions), [completions]);

  if (!hydrated) {
    return <div className="card text-sm text-slate-500">Loading adventure ledger…</div>;
  }

  return (
    <section className="card mt-10 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Adventure ledger</p>
          <h2 className="mt-1 text-xl font-bold text-white">Completed quests</h2>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gold-bright">{pending.toLocaleString()} OLC</p>
          <p className="text-xs text-slate-500">pending_claim · not on-chain yet</p>
        </div>
      </div>

      <p className="badge !text-[11px]">GPS verified · Photo proof · OLC pending claim</p>

      {completions.length === 0 ? (
        <p className="text-sm text-slate-400">
          No check-ins yet. Visit the{" "}
          <Link href="/map" className="link-accent">
            Quest Map
          </Link>
          , get within the radius, and upload a photo.
        </p>
      ) : (
        <ul className="divide-y divide-border/80">
          {completions.map((c) => {
            const q = getQuestById(c.questId);
            return (
              <li key={c.id} className="flex items-center gap-3 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.photoDataUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-white">{q?.title ?? c.questId}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(c.completedAt).toLocaleString()} · {c.distanceM}m from pin ·{" "}
                    {c.status}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-gold-bright">+{c.olcEarned}</p>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-3 pt-1">
        <Link href="/feed" className="btn-secondary !py-2 !text-xs">
          View Adventure Feed
        </Link>
        <Link href="/map" className="btn-primary !py-2 !text-xs">
          Check in on map
        </Link>
      </div>
    </section>
  );
}
