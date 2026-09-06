"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectWallet } from "@/components/ConnectWallet";
import { useWeb3Mounted } from "@/components/providers/Web3Provider";
import { loadPurchases, type LocalPurchase } from "@/lib/purchases";
import { PRESALE_BATCHES, PRESALE_META } from "@/lib/site";

function formatOlc(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function resolveOlc(p: LocalPurchase): number {
  if (typeof p.olcAmount === "number" && Number.isFinite(p.olcAmount)) return p.olcAmount;
  const n = Number(String(p.olcEstimated).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function TokenDistributionPanel() {
  const web3Mounted = useWeb3Mounted();
  if (!web3Mounted) {
    return <div className="card text-sm text-slate-500">Loading wallet…</div>;
  }
  return <TokenDistributionInner />;
}

function TokenDistributionInner() {
  const { data: session, status } = useSession();
  const { isConnected } = useAccount();
  const [purchases, setPurchases] = useState<LocalPurchase[]>([]);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(() => {
    setPurchases(loadPurchases());
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);
    const onAccount = () => refresh();
    window.addEventListener("olc-account-change", onAccount);
    return () => window.removeEventListener("olc-account-change", onAccount);
  }, [refresh]);

  const liveBatch = PRESALE_BATCHES.find((b) => b.status === "LIVE") ?? PRESALE_BATCHES[0];
  const localByStatus = useMemo(() => {
    const sums: Record<string, number> = {
      delivered: 0,
      locked: 0,
      locked_pending_chain: 0,
      pending_delivery: 0,
      pending_external: 0,
    };
    for (const p of purchases) {
      sums[p.status] = (sums[p.status] || 0) + resolveOlc(p);
    }
    return sums;
  }, [purchases]);

  const deliveredTotal = (localByStatus.delivered || 0) + (localByStatus.locked || 0);

  if (status === "loading" || !hydrated) {
    return <div className="card text-sm text-slate-500">Loading allocation…</div>;
  }

  if (!session?.user && !isConnected) {
    return (
      <div className="card space-y-5 text-center">
        <p className="text-lg font-semibold text-white">Your OLC allocation</p>
        <p className="text-sm text-slate-400">
          Connect a wallet (and optionally sign in) to see purchased OLC on this device. Verified
          buys deliver ERC-20 to your BlockDAG wallet. No fake balances.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/login?callbackUrl=/token-distribution" className="btn-primary">
            Sign in
          </Link>
          <ConnectWallet />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card border-gold/40 shadow-gold space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Your allocation</p>
            <h2 className="mt-1 text-xl font-bold text-white">Presale OLC</h2>
            <p className="mt-1 text-sm text-slate-400">
              New purchases deliver OLC ERC-20 to your BlockDAG wallet after payment verifies.
              Header shows your live wallet balance when connected on chain 1404.
            </p>
          </div>
          {!isConnected && <ConnectWallet compact />}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-bg-panel/80 p-4">
            <p className="text-xs uppercase text-slate-500">Delivered (local ledger)</p>
            <p className="mt-2 text-2xl font-bold text-gold-bright">
              {formatOlc(deliveredTotal)} OLC
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              From purchase records on this device — wallet is source of truth
            </p>
          </div>
          <div className="rounded-xl border border-border bg-bg-panel/80 p-4">
            <p className="text-xs uppercase text-slate-500">Live batch price</p>
            <p className="mt-2 text-2xl font-bold text-gold-bright">
              ${liveBatch.priceUsdt.toFixed(3)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">
              Batch {liveBatch.batch} · {liveBatch.status}
            </p>
          </div>
        </div>
      </section>

      <section className="card space-y-3">
        <h3 className="text-lg font-semibold text-white">Batch / price context</h3>
        <p className="text-sm text-slate-400">
          Presale allocation {PRESALE_META.allocationOlC.toLocaleString()} OLC (10% of 9B) · hard
          cap ${PRESALE_META.hardCapUsd.toLocaleString()}. Your buys use the live batch price at
          purchase time (stored on each local ledger row).
        </p>
        <div className="grid gap-2 sm:grid-cols-5">
          {PRESALE_BATCHES.map((b) => (
            <div
              key={b.batch}
              className={`rounded-xl border p-3 ${
                b.status === "LIVE" ? "border-gold/60 bg-gold/5" : "border-border bg-bg-panel/50"
              }`}
            >
              <p className="text-[10px] uppercase text-slate-500">
                {"label" in b && b.label ? b.label : `Batch ${b.batch}`}
              </p>
              <p className="mt-1 text-lg font-bold text-gold-bright">
                ${b.priceUsdt.toFixed(3)}
              </p>
              <span className="badge mt-2 !px-2 !py-0.5">{b.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-3">
        <h3 className="text-lg font-semibold text-white">Local purchase breakdown</h3>
        <p className="text-xs text-slate-500">
          Sourced from <code className="text-slate-400">overlandcoin.purchases.v1</code> (account
          scoped). Not inventing balances.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["delivered", "Delivered to wallet"],
              ["locked_pending_chain", "Pending wallet delivery"],
              ["pending_delivery", "Pending delivery"],
              ["pending_external", "Awaiting deposit verify"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="rounded-lg border border-border bg-bg-panel/60 px-3 py-2">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="font-semibold text-slate-100">
                {formatOlc(localByStatus[key])} OLC
              </p>
            </div>
          ))}
        </div>
        {purchases.length === 0 ? (
          <p className="text-sm text-slate-400">
            No purchases on this account yet.{" "}
            <Link href="/presale" className="link-accent">
              Buy on Presale
            </Link>
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {purchases.slice(0, 12).map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <span className="font-mono text-slate-300">
                  {p.payAmount} {p.payAsset} @ ${p.batchPriceUsed || p.batchPriceUsdt}/OLC
                </span>
                <span className="text-gold-bright">{formatOlc(resolveOlc(p))} OLC · {p.status}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/claim" className="btn-secondary !py-2 !text-xs">
            Claim / retry hub
          </Link>
          <Link href="/presale" className="btn-primary !py-2 !text-xs">
            Presale
          </Link>
        </div>
      </section>
    </div>
  );
}
