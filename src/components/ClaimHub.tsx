"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ClaimOlCButton } from "@/components/ClaimOlCButton";
import { ConnectWallet } from "@/components/ConnectWallet";
import { useWeb3Mounted } from "@/components/providers/Web3Provider";
import { claimAllPending } from "@/lib/claimReward";
import {
  loadCompletions,
  totalClaimedOlC,
  totalPendingOlC,
  type Completion,
} from "@/lib/completions";
import { getQuestById } from "@/lib/quests";
import {
  listPendingLockCredits,
  loadPurchases,
  updatePurchase,
  type LocalPurchase,
} from "@/lib/purchases";
import { explorerTxUrl } from "@/lib/token";

function isDeliverOk(status?: string): boolean {
  return status === "delivered" || status === "locked";
}

function resolveOlc(p: LocalPurchase): number {
  if (typeof p.olcAmount === "number" && Number.isFinite(p.olcAmount)) return p.olcAmount;
  const n = Number(String(p.olcEstimated).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function purchaseStatusLabel(status: LocalPurchase["status"]): {
  label: string;
  tone: string;
} {
  switch (status) {
    case "delivered":
      return { label: "Delivered to wallet", tone: "text-emerald-400" };
    case "locked":
      return { label: "Legacy PresaleLock credit", tone: "text-cyan-accent" };
    case "locked_pending_chain":
      return { label: "Pending wallet delivery", tone: "text-amber-300" };
    case "pending_delivery":
      return { label: "Pending delivery", tone: "text-amber-300" };
    case "pending_external":
      return { label: "Awaiting deposit verify", tone: "text-slate-400" };
    default:
      return { label: status, tone: "text-slate-400" };
  }
}

async function postDeliver(p: LocalPurchase, buyerFallback?: string | null) {
  const buyer = p.from || buyerFallback;
  const olcAmount = resolveOlc(p);
  if (!buyer || !(olcAmount > 0) || !p.txHash || p.txHash.startsWith("external:")) {
    return { ok: false as const, error: "Missing buyer, olcAmount, or paymentTxHash" };
  }
  const asset = (p.payAsset || "BDAG").toUpperCase();
  const payChain =
    asset === "BTC"
      ? "bitcoin"
      : asset === "SOL"
        ? "solana"
        : asset === "ETH" || asset === "USDT" || asset === "USDC"
          ? "ethereum"
          : "blockdag";

  // order: stubs are local UX keys — never treat as a payment hash. Scan by amount.
  if (p.txHash.startsWith("order:")) {
    const payAmt = Number(String(p.payAmount ?? "").replace(/,/g, ""));
    const res = await fetch("/api/presale/confirm-deposit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        buyer,
        olcAmount,
        payAsset: p.payAsset,
        payAmount: payAmt > 0 ? payAmt : undefined,
        chain: payChain,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      creditTxHash?: string;
      message?: string;
      error?: string;
      olcAmount?: number;
      paymentTxHash?: string;
    };
    return { ok: res.ok || isDeliverOk(data.status), data, status: res.status };
  }

  // Real payment tx / signature → always /api/presale/deliver (no /tmp order store).
  const res = await fetch("/api/presale/deliver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buyer,
      olcAmount,
      paymentTxHash: p.txHash,
      payChain,
      chain: payChain,
      batchPriceUsed: p.batchPriceUsed ?? p.batchPriceUsdt,
      usdRateUsed: p.usdRateUsed,
      usdPaid: p.usdPaid ?? p.usdEstimated,
      payAsset: p.payAsset,
      payAmount: p.payAmount,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    creditTxHash?: string;
    message?: string;
    error?: string;
    olcAmount?: number;
  };
  return { ok: res.ok || isDeliverOk(data.status), data, status: res.status };
}

export function ClaimHub() {
  const web3Mounted = useWeb3Mounted();
  if (!web3Mounted) {
    return <div className="card text-sm text-slate-500">Loading wallet…</div>;
  }
  return <ClaimHubInner />;
}

function ClaimHubInner() {
  const { data: session, status } = useSession();
  const { address, isConnected } = useAccount();
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [purchases, setPurchases] = useState<LocalPurchase[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);
  const [retryBusy, setRetryBusy] = useState<string | null>(null);
  const [retryNote, setRetryNote] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setCompletions(loadCompletions());
    setPurchases(loadPurchases());
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);
    const onAccount = () => refresh();
    window.addEventListener("olc-account-change", onAccount);
    const t = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener("olc-account-change", onAccount);
      clearInterval(t);
    };
  }, [refresh]);

  const pendingOlC = useMemo(() => totalPendingOlC(completions), [completions]);
  const claimedOlC = useMemo(() => totalClaimedOlC(completions), [completions]);
  const pendingRows = useMemo(
    () => completions.filter((c) => c.status === "pending_claim"),
    [completions],
  );
  const claimedRows = useMemo(
    () => completions.filter((c) => c.status === "claimed"),
    [completions],
  );
  const pendingLock = useMemo(() => {
    void purchases; // refresh when local purchase ledger changes
    return listPendingLockCredits(address);
  }, [purchases, address]);
  const lockedPurchases = useMemo(
    () => purchases.filter((p) => p.status === "delivered" || p.status === "locked"),
    [purchases],
  );

  const onClaimAll = useCallback(async () => {
    setBulkMsg(null);
    if (!isConnected || !address) {
      setBulkMsg("Connect your wallet to claim quest rewards.");
      return;
    }
    setBulkBusy(true);
    try {
      const { claimed: ok, failed } = await claimAllPending(address);
      refresh();
      if (ok.length && !failed.length) {
        setBulkMsg(`Claimed ${ok.length} quest reward(s) to your wallet.`);
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

  const onRetryCredit = useCallback(
    async (p: LocalPurchase) => {
      setRetryNote(null);
      if (!address && !p.from) {
        setRetryNote("Connect the buying wallet to retry OLC delivery.");
        return;
      }
      setRetryBusy(p.txHash);
      try {
        const result = await postDeliver(p, address);
        const data = result.data;
        if (data && isDeliverOk(data.status) && data.creditTxHash) {
          updatePurchase(p.txHash, {
            status: "delivered",
            creditTxHash: data.creditTxHash,
            olcAmount:
              typeof data.olcAmount === "number" ? data.olcAmount : resolveOlc(p),
            from: p.from || address || undefined,
            deliveryNote: undefined,
          });
          setRetryNote("OLC delivered to your BlockDAG wallet.");
        } else {
          updatePurchase(p.txHash, {
            status: "locked_pending_chain",
            deliveryNote:
              data?.message || data?.error || "Still awaiting OLC wallet delivery",
          });
          setRetryNote(
            data?.message || data?.error || "Still pending wallet delivery.",
          );
        }
        refresh();
      } catch (e) {
        setRetryNote(e instanceof Error ? e.message : "Retry failed");
      } finally {
        setRetryBusy(null);
      }
    },
    [address, refresh],
  );

  if (status === "loading" || !hydrated) {
    return <div className="card text-sm text-slate-500">Loading claim hub…</div>;
  }

  if (!session?.user && !isConnected) {
    return (
      <div className="card space-y-5 text-center">
        <p className="text-lg font-semibold text-white">Claim OLC</p>
        <p className="text-sm text-slate-400">
          Sign in and/or connect a wallet to claim pending quest rewards and retry OLC
          delivery from your local adventure + purchase ledgers.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/login?callbackUrl=/claim" className="btn-primary">
            Sign in
          </Link>
          <Link href="/register" className="btn-secondary">
            Create account
          </Link>
          <ConnectWallet />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-3">
        <div className="card !p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Quest pending</p>
          <p className="mt-2 text-2xl font-bold text-gold-bright">
            {pendingOlC.toLocaleString()} OLC
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Claim-to-wallet via rewards API</p>
        </div>
        <div className="card !p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Quest claimed</p>
          <p className="mt-2 text-2xl font-bold text-emerald-400">
            {claimedOlC.toLocaleString()} OLC
          </p>
          <p className="mt-1 text-[11px] text-slate-500">Already paid on-chain</p>
        </div>
        <div className="card !p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Presale delivery retries</p>
          <p className="mt-2 text-2xl font-bold text-amber-300">{pendingLock.length}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            locked_pending_chain — payment verified, wallet transfer pending
          </p>
        </div>
      </section>

      <section className="card space-y-4 border-gold/30">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-white">Quest rewards</h2>
            <p className="mt-1 text-sm text-slate-400">
              From your local completions ledger. Pays via{" "}
              <code className="text-slate-300">POST /api/rewards/claim</code> to the connected
              wallet — never marked claimed without a real tx hash.
            </p>
          </div>
          {pendingRows.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {isConnected && address ? (
                <button
                  type="button"
                  className="btn-primary !py-2 !text-xs disabled:opacity-40"
                  disabled={bulkBusy}
                  onClick={() => void onClaimAll()}
                >
                  {bulkBusy ? "Claiming…" : `Claim all (${pendingOlC.toLocaleString()} OLC)`}
                </button>
              ) : (
                <ConnectWallet compact />
              )}
            </div>
          )}
        </div>
        {bulkMsg && <p className="text-xs text-slate-300">{bulkMsg}</p>}

        {pendingRows.length === 0 && claimedRows.length === 0 ? (
          <p className="text-sm text-slate-400">
            No quest rewards yet. Check in on the{" "}
            <Link href="/map" className="link-accent">
              Quest Map
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-border/80">
            {[...pendingRows, ...claimedRows].map((c) => {
              const q = getQuestById(c.questId);
              const statusTone =
                c.status === "claimed" ? "text-emerald-400" : "text-amber-300";
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  {c.photoDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.photoDataUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-12 w-12 shrink-0 rounded-lg bg-bg-panel" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-white">{q?.title ?? c.questId}</p>
                    <p className={`text-xs ${statusTone}`}>
                      {c.status === "claimed" ? "Claimed" : "Pending claim"} ·{" "}
                      {new Date(c.completedAt).toLocaleString()}
                    </p>
                    {c.txHash && (
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
                  <p className="shrink-0 font-semibold text-gold-bright">+{c.olcEarned} OLC</p>
                  {c.status === "pending_claim" && (
                    <div className="w-full sm:w-auto sm:max-w-[220px]">
                      <ClaimOlCButton completion={c} compact onClaimed={() => refresh()} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="text-xl font-bold text-white">Presale purchases</h2>
          <p className="mt-1 text-sm text-slate-400">
            Purchased OLC is transferred to your BlockDAG wallet after payment verifies.
            Legacy PresaleLock balances (if any) still show separately. Use{" "}
            <strong className="text-slate-200">Retry deliver</strong> when status is pending.
          </p>
        </div>
        {retryNote && (
          <p className="rounded-lg border border-cyan-accent/30 bg-cyan-accent/5 p-3 text-xs text-cyan-100">
            {retryNote}
          </p>
        )}
        {purchases.length === 0 ? (
          <p className="text-sm text-slate-400">
            No local purchases. Buy on{" "}
            <Link href="/presale" className="link-accent">
              Presale
            </Link>
            .
          </p>
        ) : (
          <ul className="space-y-2">
            {purchases.map((p) => {
              const meta = purchaseStatusLabel(p.status);
              const canRetry =
                p.status === "locked_pending_chain" &&
                p.txHash &&
                !p.txHash.startsWith("external:");
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-bg-panel/60 px-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-slate-200">
                      {p.payAmount} {p.payAsset} →{" "}
                      <span className="text-gold-bright">{resolveOlc(p).toLocaleString()} OLC</span>
                    </p>
                    <p className={`text-xs ${meta.tone}`}>{meta.label}</p>
                    {p.deliveryNote && (
                      <p className="text-[11px] text-slate-500">{p.deliveryNote}</p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canRetry && (
                      <button
                        type="button"
                        className="btn-primary !py-1.5 !text-xs"
                        disabled={retryBusy === p.txHash}
                        onClick={() => void onRetryCredit(p)}
                      >
                        {retryBusy === p.txHash ? "Retrying…" : "Retry lock credit"}
                      </button>
                    )}
                    {p.txHash.startsWith("0x") && (
                      <a
                        href={explorerTxUrl(p.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-accent text-xs font-mono"
                      >
                        View tx
                      </a>
                    )}
                    {p.creditTxHash && (
                      <a
                        href={explorerTxUrl(p.creditTxHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="link-accent text-xs font-mono"
                      >
                        Credit tx
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {lockedPurchases.length > 0 && (
          <p className="text-xs text-slate-500">
            See{" "}
            <Link href="/token-distribution" className="link-accent">
              Token Distribution
            </Link>{" "}
            for on-chain locked balance + unlock messaging.
          </p>
        )}
      </section>
    </div>
  );
}
