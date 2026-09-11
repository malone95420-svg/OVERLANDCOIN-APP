"use client";

import { useEffect, useState } from "react";
import { livePresaleBatch } from "@/lib/site";

export type BatchStats = {
  batch: number;
  allocationOlC: number;
  soldOlC: number;
  remainingOlC: number;
  pctSold: number;
};

function formatOlc(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

export function LiveBatchRemaining({ compact = false }: { compact?: boolean }) {
  const fallback = livePresaleBatch();
  const [stats, setStats] = useState<BatchStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/presale/stats", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as BatchStats;
        if (!cancelled && typeof data.remainingOlC === "number") {
          setStats(data);
        }
      } catch {
        /* keep last */
      }
    }
    void load();
    const id = window.setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const allocation = stats?.allocationOlC ?? fallback.allocationOlC;
  const remaining = stats?.remainingOlC ?? allocation;
  const sold = stats?.soldOlC ?? 0;
  const pctSold = stats?.pctSold ?? 0;
  const pctLeft = Math.max(0, 100 - pctSold);

  if (compact) {
    return (
      <p className="mt-2 text-sm text-slate-300">
        <span className="font-semibold text-gold-bright">{formatOlc(remaining)}</span>
        {" "}OLC remaining in Batch {fallback.batch}
        <span className="text-slate-500">
          {" "}
          · {formatOlc(sold)} sold of {formatOlc(allocation)}
        </span>
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">Remaining</p>
        <p className="text-lg font-bold tabular-nums text-gold-bright">
          {formatOlc(remaining)}
          <span className="ml-1 text-xs font-semibold text-slate-400">OLC</span>
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gold-bright"
          style={{ width: `${pctLeft}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        {formatOlc(sold)} sold · {formatOlc(allocation)} in this batch
      </p>
    </div>
  );
}
