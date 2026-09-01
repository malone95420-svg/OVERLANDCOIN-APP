"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useSwitchChain,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, type Hash } from "viem";
import { ConnectWallet } from "@/components/ConnectWallet";
import { useWeb3Mounted } from "@/components/providers/Web3Provider";
import { blockdag, blockdagAddChainParams } from "@/lib/chain";
import { getPresaleLockAddress, PRESALE_LOCK_ABI } from "@/lib/presaleLock";
import {
  listPendingLockCredits,
  sumLocalLockedOlc,
  updatePurchase,
  type LocalPurchase,
} from "@/lib/purchases";
import { TOKEN, explorerAddressUrl, explorerTxUrl } from "@/lib/token";

function formatOlc(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function resolveOlc(p: LocalPurchase): number {
  if (typeof p.olcAmount === "number" && Number.isFinite(p.olcAmount)) return p.olcAmount;
  const n = Number(String(p.olcEstimated).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

async function postDeliver(p: LocalPurchase, buyerFallback?: string | null) {
  const buyer = p.from || buyerFallback;
  const olcAmount = resolveOlc(p);
  if (!buyer || !(olcAmount > 0) || !p.txHash?.startsWith("0x")) {
    return { ok: false as const, error: "Missing buyer, olcAmount, or paymentTxHash" };
  }
  const res = await fetch("/api/presale/deliver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      buyer,
      olcAmount,
      paymentTxHash: p.txHash,
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
    alreadyDelivered?: boolean;
  };
  return { ok: res.ok || data.status === "locked", data, status: res.status };
}

async function addBlockdagNetwork(): Promise<void> {
  const eth = (
    window as unknown as {
      ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
    }
  ).ethereum;
  if (!eth?.request) {
    throw new Error("No injected wallet found. Install MetaMask or another injected wallet.");
  }
  await eth.request({
    method: "wallet_addEthereumChain",
    params: [blockdagAddChainParams()],
  });
}

type LockedBalanceApi = {
  locked: number;
  totalLocked: number;
  tradingEnabled: boolean;
  lockAddress: string | null;
  error?: string;
};

export function LockedPresaleOlC() {
  const web3Mounted = useWeb3Mounted();
  if (!web3Mounted) {
    return (
      <div className="rounded-xl border border-border bg-bg-card p-4 text-sm text-slate-400">
        Loading wallet…
      </div>
    );
  }
  return <LockedPresaleOlCInner />;
}

function LockedPresaleOlCInner() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const lockAddress = getPresaleLockAddress();
  const onCorrectChain = isConnected && chainId === TOKEN.chainId;
  const wrongNetwork = isConnected && chainId !== TOKEN.chainId;

  const [localSum, setLocalSum] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [retryBusy, setRetryBusy] = useState(false);
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const autoRetried = useRef(false);

  const [apiLocked, setApiLocked] = useState<number | null>(null);
  const [apiTrading, setApiTrading] = useState<boolean | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [apiLoading, setApiLoading] = useState(false);

  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const [netBusy, setNetBusy] = useState(false);
  const [netError, setNetError] = useState<string | null>(null);

  const refreshLocal = useCallback(() => {
    setLocalSum(sumLocalLockedOlc(address));
    setPendingCount(listPendingLockCredits(address).length);
  }, [address]);

  useEffect(() => {
    refreshLocal();
    const onStorage = () => refreshLocal();
    window.addEventListener("storage", onStorage);
    const t = setInterval(refreshLocal, 4000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(t);
    };
  }, [refreshLocal]);

  const fetchLockedApi = useCallback(async () => {
    if (!address) {
      setApiLocked(null);
      setApiTrading(null);
      setApiError(null);
      setApiLoading(false);
      return;
    }
    setApiLoading(true);
    try {
      const res = await fetch(
        `/api/presale/locked-balance?address=${encodeURIComponent(address)}`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => ({}))) as LockedBalanceApi;
      if (typeof data.locked === "number" && Number.isFinite(data.locked)) {
        setApiLocked(data.locked);
      }
      if (typeof data.tradingEnabled === "boolean") {
        setApiTrading(data.tradingEnabled);
      }
      setApiError(res.ok ? null : data.error || `HTTP ${res.status}`);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Failed to read locked balance");
    } finally {
      setApiLoading(false);
    }
  }, [address]);

  useEffect(() => {
    void fetchLockedApi();
    if (!address) return;
    const t = setInterval(() => void fetchLockedApi(), 10_000);
    return () => clearInterval(t);
  }, [address, fetchLockedApi]);

  // Optional wagmi enhancement — only when already on BlockDAG; never gates display.
  const { data: onChainLocked, refetch: refetchLocked } = useReadContract({
    address: lockAddress ?? undefined,
    abi: PRESALE_LOCK_ABI,
    functionName: "lockedBalance",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(lockAddress && address && onCorrectChain),
      refetchInterval: 12_000,
    },
  });

  const { data: tradingEnabledWagmi, refetch: refetchTrading } = useReadContract({
    address: lockAddress ?? undefined,
    abi: PRESALE_LOCK_ABI,
    functionName: "tradingEnabled",
    query: {
      enabled: Boolean(lockAddress && onCorrectChain),
      refetchInterval: 15_000,
    },
  });

  const wagmiNum = useMemo(() => {
    if (lockAddress && onChainLocked != null) {
      return Number(formatUnits(onChainLocked as bigint, TOKEN.decimals));
    }
    return null;
  }, [lockAddress, onChainLocked]);

  // Prefer server API; fall back to wagmi when available.
  const onChainNum = useMemo(() => {
    if (apiLocked != null) return apiLocked;
    if (wagmiNum != null) return wagmiNum;
    return null;
  }, [apiLocked, wagmiNum]);

  // Always show MAX(on-chain locked, localSum of locked/locked_pending_chain)
  const lockedDisplay = useMemo(() => {
    if (onChainNum != null) {
      return Math.max(onChainNum, localSum);
    }
    return localSum;
  }, [onChainNum, localSum]);

  const localAhead =
    onChainNum != null && localSum > onChainNum + 1e-8 && pendingCount > 0;

  const unlocked = Boolean(
    apiTrading != null ? apiTrading : tradingEnabledWagmi,
  );

  const { writeContractAsync, isPending: writing } = useWriteContract();
  const [withdrawHash, setWithdrawHash] = useState<Hash | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { isLoading: waitingWithdraw, isSuccess: withdrawOk } =
    useWaitForTransactionReceipt({ hash: withdrawHash });

  useEffect(() => {
    if (withdrawOk) {
      void refetchLocked();
      void refetchTrading();
      void fetchLockedApi();
      setWithdrawHash(undefined);
    }
  }, [withdrawOk, refetchLocked, refetchTrading, fetchLockedApi]);

  const onSwitchNetwork = useCallback(async () => {
    setNetError(null);
    try {
      // Re-offer send-capable RPCs (west) so MetaMask can leave engineering.
      setNetBusy(true);
      try {
        await addBlockdagNetwork();
      } catch {
        // Chain may already exist.
      }
      await switchChainAsync({ chainId: blockdag.id });
    } catch (e) {
      setNetError(e instanceof Error ? e.message : "Could not switch to BlockDAG");
    } finally {
      setNetBusy(false);
    }
  }, [switchChainAsync]);

  const onAddNetwork = useCallback(async () => {
    setNetError(null);
    setNetBusy(true);
    try {
      await addBlockdagNetwork();
    } catch (e) {
      setNetError(e instanceof Error ? e.message : "Could not add BlockDAG");
    } finally {
      setNetBusy(false);
    }
  }, []);

  const retryPendingCredits = useCallback(
    async (opts?: { quiet?: boolean }) => {
      const pending = listPendingLockCredits(address);
      if (pending.length === 0) {
        if (!opts?.quiet) setRetryNote("No pending lock credits to retry.");
        return;
      }
      if (!opts?.quiet) setRetryBusy(true);
      setRetryNote(opts?.quiet ? null : `Retrying ${pending.length} pending credit(s)…`);
      let locked = 0;
      let stillPending = 0;
      for (const p of pending) {
        try {
          const result = await postDeliver(p, address);
          if (result.data?.status === "locked" && result.data.creditTxHash) {
            updatePurchase(p.txHash, {
              status: "locked",
              creditTxHash: result.data.creditTxHash,
              olcAmount:
                typeof result.data.olcAmount === "number" ? result.data.olcAmount : resolveOlc(p),
              from: p.from || address || undefined,
              deliveryNote: undefined,
            });
            locked += 1;
          } else {
            stillPending += 1;
            updatePurchase(p.txHash, {
              status: "locked_pending_chain",
              olcAmount: resolveOlc(p),
              from: p.from || address || undefined,
              deliveryNote:
                result.data?.message || result.data?.error || "Still awaiting on-chain credit",
            });
          }
        } catch (e) {
          stillPending += 1;
          updatePurchase(p.txHash, {
            deliveryNote: e instanceof Error ? e.message : "Retry failed",
          });
        }
      }
      refreshLocal();
      void refetchLocked();
      void fetchLockedApi();
      if (!opts?.quiet) {
        setRetryNote(
          locked > 0
            ? `Credited ${locked} purchase(s) on-chain.${stillPending ? ` ${stillPending} still pending.` : ""}`
            : stillPending
              ? `Still pending (${stillPending}). Deliver API may be unavailable — local locked credit still counts above.`
              : "Done.",
        );
        setRetryBusy(false);
      } else if (locked > 0) {
        setRetryNote(`Auto-retried: ${locked} credit(s) confirmed on-chain.`);
      }
    },
    [address, refreshLocal, refetchLocked, fetchLockedApi],
  );

  // Optional: on mount, auto-retry pending credits once quietly
  useEffect(() => {
    if (autoRetried.current) return;
    if (!address || !lockAddress) return;
    const pending = listPendingLockCredits(address);
    if (pending.length === 0) return;
    autoRetried.current = true;
    void retryPendingCredits({ quiet: true });
  }, [address, lockAddress, retryPendingCredits]);

  async function onWithdraw() {
    setError(null);
    if (!lockAddress) {
      setError("Presale lock address not configured.");
      return;
    }
    if (!onCorrectChain) {
      setError(`Switch to BlockDAG Mainnet (chainId ${TOKEN.chainId}).`);
      return;
    }
    if (!unlocked) {
      setError("Trading is not enabled yet — wait until OVERLANDCOIN is listed on exchanges.");
      return;
    }
    try {
      const hash = await writeContractAsync({
        address: lockAddress,
        abi: PRESALE_LOCK_ABI,
        functionName: "withdraw",
        chainId: TOKEN.chainId,
      });
      setWithdrawHash(hash);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Withdraw failed");
    }
  }

  const balanceSourceLabel = (() => {
    if (!lockAddress) return "From local purchase records (lock address not set)";
    if (onChainNum != null) {
      if (localSum > onChainNum) {
        return `Showing max(on-chain ${formatOlc(onChainNum)}, local ${formatOlc(localSum)})`;
      }
      return apiLocked != null
        ? "From PresaleLock (server RPC)"
        : "From PresaleLock contract";
    }
    if (wrongNetwork) {
      return "On-chain balance via server — switch network to withdraw";
    }
    if (apiLoading && apiLocked == null) return "Loading locked balance…";
    if (apiError && apiLocked == null) return `Could not read lock: ${apiError}`;
    return "No on-chain locked balance yet";
  })();

  return (
    <section className="card border-cyan-accent/30">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">Locked presale OLC</h2>
          <p className="mt-1 text-sm text-slate-400">
            Presale purchases are credited immediately into a lock contract. Tokens are yours but{" "}
            <strong className="text-slate-200">non-transferable until exchange listing unlock</strong>
            . Quest rewards are separate and still claim-to-wallet.
          </p>
        </div>
        <ConnectWallet />
      </div>

      {wrongNetwork && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-50 space-y-2">
          <p>
            <strong>Switch MetaMask to BlockDAG Mainnet ({TOKEN.chainId})</strong> to withdraw or
            write on-chain. Locked balance below is still read via server RPC.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary !text-xs !px-3 !py-1.5"
              disabled={isSwitching || netBusy}
              onClick={() => void onSwitchNetwork()}
            >
              {isSwitching || netBusy ? "Switching…" : "Switch to BlockDAG"}
            </button>
            <button
              type="button"
              className="btn-secondary !text-xs !px-3 !py-1.5"
              disabled={netBusy}
              onClick={() => void onAddNetwork()}
            >
              Add BlockDAG
            </button>
          </div>
          {netError && <p className="text-xs text-red-300">{netError}</p>}
        </div>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-bg-panel/80 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Your locked balance</p>
          <p className="mt-2 text-2xl font-bold text-gold-bright">
            {formatOlc(lockedDisplay)} OLC
          </p>
          <p className="mt-1 text-[11px] text-slate-500">{balanceSourceLabel}</p>
        </div>
        <div className="rounded-xl border border-border bg-bg-panel/80 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Unlock status</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {lockAddress
              ? apiTrading == null && tradingEnabledWagmi == null
                ? apiLoading
                  ? "Checking…"
                  : "Locked until listing"
                : unlocked
                  ? "Trading enabled"
                  : "Locked until listing"
              : "Awaiting config"}
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            Owner calls <code className="text-slate-400">enableTrading()</code> after listings.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-bg-panel/80 p-4 flex flex-col justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Withdraw</p>
            <p className="mt-1 text-[11px] text-slate-500">
              Pulls your full locked balance to this wallet when unlocked.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary mt-3 !text-sm"
            disabled={
              !lockAddress ||
              !unlocked ||
              !onCorrectChain ||
              lockedDisplay <= 0 ||
              writing ||
              waitingWithdraw
            }
            onClick={() => void onWithdraw()}
          >
            {writing || waitingWithdraw
              ? "Confirming…"
              : unlocked
                ? "Withdraw to wallet"
                : "Withdraw locked until listing"}
          </button>
        </div>
      </div>

      {!lockAddress && (
        <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90">
          <strong>Awaiting lock contract config.</strong> Set{" "}
          <code className="text-amber-50">NEXT_PUBLIC_PRESALE_LOCK_ADDRESS</code> after deploying{" "}
          <code className="text-amber-50">PresaleLock</code>. Local credits still count as yours —
          not transferable wallet delivery.
        </p>
      )}
      {(localAhead || pendingCount > 0) && lockAddress && (
        <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90 space-y-2">
          <p>
            {localAhead ? (
              <>
                Local pending locked OLC ({formatOlc(localSum)}) is ahead of on-chain lockedBalance (
                {formatOlc(onChainNum ?? 0)}). Payment to treasury may have succeeded while PresaleLock
                credit is still pending.
              </>
            ) : (
              <>
                {pendingCount} purchase(s) are <code className="text-amber-50">locked_pending_chain</code>
                . Balance above uses max(on-chain, local) so you still see them.
              </>
            )}
          </p>
          <button
            type="button"
            className="btn-primary !text-xs !px-3 !py-1.5"
            disabled={retryBusy || pendingCount === 0}
            onClick={() => void retryPendingCredits()}
          >
            {retryBusy ? "Retrying…" : "Retry lock credit"}
          </button>
        </div>
      )}
      {retryNote && (
        <p className="mt-3 rounded-lg border border-cyan-accent/30 bg-cyan-accent/5 p-3 text-xs text-cyan-100">
          {retryNote}
        </p>
      )}
      {lockAddress && (
        <p className="mt-3 text-[11px] text-slate-500">
          Lock contract:{" "}
          <a
            className="link-accent font-mono"
            href={explorerAddressUrl(lockAddress)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {lockAddress}
          </a>
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </p>
      )}
      {withdrawHash && (
        <p className="mt-2 text-xs text-slate-400">
          Withdraw tx:{" "}
          <a
            className="link-accent font-mono"
            href={explorerTxUrl(withdrawHash)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {withdrawHash.slice(0, 10)}…
          </a>
        </p>
      )}
    </section>
  );
}
