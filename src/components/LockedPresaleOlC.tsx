"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useChainId,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits, type Hash } from "viem";
import { ConnectWallet } from "@/components/ConnectWallet";
import { getPresaleLockAddress, PRESALE_LOCK_ABI } from "@/lib/presaleLock";
import { loadPurchases, sumLocalLockedOlc } from "@/lib/purchases";
import { TOKEN, explorerAddressUrl, explorerTxUrl } from "@/lib/token";

function formatOlc(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

export function LockedPresaleOlC() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const lockAddress = getPresaleLockAddress();
  const onCorrectChain = isConnected && chainId === TOKEN.chainId;

  const [localSum, setLocalSum] = useState(0);
  const [localNote, setLocalNote] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setLocalSum(sumLocalLockedOlc(address));
      const pending = loadPurchases().some(
        (p) =>
          p.status === "locked_pending_chain" &&
          (!address || !p.from || p.from.toLowerCase() === address.toLowerCase()),
      );
      setLocalNote(pending);
    };
    refresh();
    const onStorage = () => refresh();
    window.addEventListener("storage", onStorage);
    const t = setInterval(refresh, 4000);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(t);
    };
  }, [address]);

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

  const { data: tradingEnabled, refetch: refetchTrading } = useReadContract({
    address: lockAddress ?? undefined,
    abi: PRESALE_LOCK_ABI,
    functionName: "tradingEnabled",
    query: {
      enabled: Boolean(lockAddress),
      refetchInterval: 15_000,
    },
  });

  const lockedDisplay = useMemo(() => {
    if (lockAddress && onChainLocked != null) {
      return Number(formatUnits(onChainLocked as bigint, TOKEN.decimals));
    }
    return localSum;
  }, [lockAddress, onChainLocked, localSum]);

  const unlocked = Boolean(tradingEnabled);

  const { writeContractAsync, isPending: writing } = useWriteContract();
  const [withdrawHash, setWithdrawHash] = useState<Hash | undefined>();
  const [error, setError] = useState<string | null>(null);
  const { isLoading: waitingWithdraw, isSuccess: withdrawOk } =
    useWaitForTransactionReceipt({ hash: withdrawHash });

  useEffect(() => {
    if (withdrawOk) {
      void refetchLocked();
      void refetchTrading();
      setWithdrawHash(undefined);
    }
  }, [withdrawOk, refetchLocked, refetchTrading]);

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

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-bg-panel/80 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Your locked balance</p>
          <p className="mt-2 text-2xl font-bold text-gold-bright">
            {formatOlc(lockedDisplay)} OLC
          </p>
          <p className="mt-1 text-[11px] text-slate-500">
            {lockAddress
              ? onChainLocked != null
                ? "From PresaleLock contract"
                : "Reading contract…"
              : "From local purchase records (lock address not set)"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-bg-panel/80 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Unlock status</p>
          <p className="mt-2 text-lg font-semibold text-white">
            {lockAddress ? (unlocked ? "Trading enabled" : "Locked until listing") : "Awaiting config"}
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
      {localNote && lockAddress && (
        <p className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-100/90">
          Some purchases are <code className="text-amber-50">locked_pending_chain</code> (server
          could not credit yet). Balance above may under-count until those are synced on-chain.
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
