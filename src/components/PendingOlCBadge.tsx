"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadCompletions, totalClaimedOlC, totalPendingOlC } from "@/lib/completions";

/** Header / garage chip: pending claimable OLC vs claimed. */
export function PendingOlCBadge({ className = "" }: { className?: string }) {
  const [pending, setPending] = useState(0);
  const [claimed, setClaimed] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      const list = loadCompletions();
      setPending(totalPendingOlC(list));
      setClaimed(totalClaimedOlC(list));
      setReady(true);
    };
    sync();
    const onStorage = (e: StorageEvent) => {
      if (
        e.key === "overlandcoin.completions.v1" ||
        e.key === "overlandcoin.claims.v1" ||
        e.key == null
      ) {
        sync();
      }
    };
    window.addEventListener("storage", onStorage);
    const id = window.setInterval(sync, 4000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(id);
    };
  }, []);

  if (!ready || (pending === 0 && claimed === 0)) return null;

  return (
    <Link
      href="/garage"
      className={`hidden items-center gap-1.5 rounded-lg border border-border bg-bg-card px-2.5 py-1.5 text-[11px] text-slate-300 hover:border-gold/40 sm:inline-flex ${className}`}
      title="Quest rewards — claim from Garage"
    >
      {pending > 0 ? (
        <>
          <span className="font-semibold text-gold-bright">{pending.toLocaleString()}</span>
          <span className="text-slate-500">pending</span>
        </>
      ) : (
        <>
          <span className="font-semibold text-emerald-400">{claimed.toLocaleString()}</span>
          <span className="text-slate-500">claimed</span>
        </>
      )}
      <span className="text-slate-600">OLC</span>
    </Link>
  );
}
