"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectWallet } from "@/components/ConnectWallet";
import { claimRewardToWallet } from "@/lib/claimReward";
import type { Completion } from "@/lib/completions";
import { explorerTxUrl } from "@/lib/token";

type Props = {
  completion: Completion;
  /** Called after a successful claim (local ledger updated). */
  onClaimed?: (completion: Completion) => void;
  className?: string;
  /** Compact row button style */
  compact?: boolean;
};

export function ClaimOlCButton({ completion, onClaimed, className = "", compact }: Props) {
  const { address, isConnected } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(completion.txHash ?? null);

  const onClaim = useCallback(async () => {
    setError(null);
    if (!isConnected || !address) {
      setError("Connect your wallet to claim OLC.");
      return;
    }
    setBusy(true);
    try {
      const res = await claimRewardToWallet({ completion, wallet: address });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setTxHash(res.txHash);
      onClaimed?.(res.completion);
    } finally {
      setBusy(false);
    }
  }, [address, completion, isConnected, onClaimed]);

  if (completion.status === "claimed" || txHash) {
    const hash = txHash || completion.txHash;
    return (
      <div className={`space-y-1 ${className}`}>
        <p className="text-xs font-medium text-emerald-400">Claimed</p>
        {hash && (
          <a
            href={explorerTxUrl(hash)}
            target="_blank"
            rel="noopener noreferrer"
            className="link-accent break-all text-[11px]"
          >
            View tx {hash.slice(0, 10)}…
          </a>
        )}
      </div>
    );
  }

  if (!isConnected || !address) {
    return (
      <div className={`space-y-2 ${className}`}>
        <p className="text-xs text-slate-400">Connect wallet to claim OLC to your address.</p>
        <ConnectWallet compact />
        {error && <p className="text-xs text-red-300">{error}</p>}
      </div>
    );
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <button
        type="button"
        className={
          compact
            ? `btn-primary !py-1.5 !text-xs disabled:opacity-40 ${className}`
            : `btn-primary w-full disabled:opacity-40 ${className}`
        }
        disabled={busy}
        onClick={onClaim}
      >
        {busy ? "Claiming…" : `Claim ${completion.olcEarned} OLC to wallet`}
      </button>
      <p className="text-[10px] text-slate-500">
        Pays from the Overland rewards wallet to {address.slice(0, 6)}…{address.slice(-4)} only.
      </p>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}
