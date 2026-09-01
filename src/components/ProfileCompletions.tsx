"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ClaimOlCButton } from "@/components/ClaimOlCButton";
import { ConnectWallet } from "@/components/ConnectWallet";
import { claimAllPending } from "@/lib/claimReward";
import { getQuestById } from "@/lib/quests";
import {
  loadCompletions,
  totalClaimedOlC,
  totalPendingOlC,
  type Completion,
} from "@/lib/completions";
import { explorerTxUrl } from "@/lib/token";

export function ProfileCompletions() {
  const { address, isConnected } = useAccount();
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setCompletions(loadCompletions());
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);
  }, [refresh]);

  const pending = useMemo(() => totalPendingOlC(completions), [completions]);
  const claimed = useMemo(() => totalClaimedOlC(completions), [completions]);
  const pendingRows = useMemo(
    () => completions.filter((c) => c.status === "pending_claim"),
    [completions],
  );

  const onClaimAll = useCallback(async () => {
    setBulkMsg(null);
    if (!isConnected || !address) {
      setBulkMsg("Connect your wallet to claim.");
      return;
    }
    setBulkBusy(true);
    try {
      const { claimed: ok, failed } = await claimAllPending(address);
      refresh();
      if (ok.length && !failed.length) {
        setBulkMsg(`Claimed ${ok.length} reward(s) to your wallet.`);
      } else if (ok.length) {
        setBulkMsg(
          `Claimed ${ok.length}; ${failed.length} failed (${failed[0]?.error ?? "error"}).`,
        );
      } else {
        setBulkMsg(failed[0]?.error ?? "Nothing claimed.");
      }
    } finally {
      setBulkBusy(false);
    }
  }, [address, isConnected, refresh]);

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
          <p className="text-xs text-slate-500">pending claimable</p>
          <p className="mt-1 text-sm text-emerald-400">{claimed.toLocaleString()} OLC claimed</p>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        GPS + photo required. OLC pays from the Overland rewards wallet to your connected address
        when configured — we never mark claimed without a real tx hash.
      </p>

      {pendingRows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-bg-panel/80 p-3">
          {isConnected && address ? (
            <button
              type="button"
              className="btn-primary !py-2 !text-xs disabled:opacity-40"
              disabled={bulkBusy}
              onClick={onClaimAll}
            >
              {bulkBusy ? "Claiming all…" : `Claim all (${pending.toLocaleString()} OLC)`}
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">Connect wallet to claim</span>
              <ConnectWallet compact />
            </div>
          )}
          {bulkMsg && <p className="text-xs text-slate-300">{bulkMsg}</p>}
        </div>
      )}

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
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3 sm:flex-nowrap">
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
                  {c.status === "claimed" && c.txHash && (
                    <a
                      href={explorerTxUrl(c.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-accent text-[11px]"
                    >
                      Tx {c.txHash.slice(0, 10)}…
                    </a>
                  )}
                </div>
                <p className="shrink-0 text-sm font-semibold text-gold-bright">+{c.olcEarned}</p>
                {c.status === "pending_claim" && (
                  <div className="w-full sm:w-auto sm:max-w-[220px]">
                    <ClaimOlCButton
                      completion={c}
                      compact
                      onClaimed={() => refresh()}
                    />
                  </div>
                )}
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
