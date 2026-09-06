"use client";

import { useWeb3Mounted } from "@/components/providers/Web3Provider";
import { useWalletBalances } from "@/hooks/useWalletBalances";

type Props = {
  /** Tighter padding / hide OLC on very small screens */
  compact?: boolean;
  /** Show OLC ERC-20 next to BDAG when available (default true) */
  showOlc?: boolean;
  className?: string;
};

/**
 * Compact mono chip: native BDAG balance for connected wallet on BlockDAG 1404.
 * Renders nothing when disconnected or on the wrong chain (parent shows Switch).
 */
export function WalletBalanceChip({
  compact = false,
  showOlc = true,
  className = "",
}: Props) {
  const web3Mounted = useWeb3Mounted();
  if (!web3Mounted) return null;
  return <WalletBalanceChipInner compact={compact} showOlc={showOlc} className={className} />;
}

function WalletBalanceChipInner({
  compact,
  showOlc,
  className,
}: {
  compact: boolean;
  showOlc: boolean;
  className: string;
}) {
  const bal = useWalletBalances({ includeOlc: showOlc });

  if (!bal.isConnected || !bal.onCorrectChain) return null;

  const bdagLabel = bal.bdagFormatted ?? (bal.bdagLoading ? "…" : "—");
  const showOlcChip = showOlc && bal.olcFormatted != null;

  return (
    <div
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-border bg-bg-panel/80 px-2 py-1 font-mono text-[11px] text-slate-300 ${
        compact ? "sm:px-2.5" : "px-2.5"
      } ${className}`}
      title="Native BDAG balance on BlockDAG (chain 1404)"
    >
      <span className="shrink-0 font-semibold text-gold-bright tabular-nums">{bdagLabel}</span>
      <span className="shrink-0 text-slate-500">BDAG</span>
      {showOlcChip && (
        <>
          <span className={`text-slate-600 ${compact ? "hidden sm:inline" : ""}`}>·</span>
          <span
            className={`shrink-0 font-semibold text-cyan-100/90 tabular-nums ${
              compact ? "hidden sm:inline" : ""
            }`}
          >
            {bal.olcFormatted}
          </span>
          <span className={`shrink-0 text-slate-500 ${compact ? "hidden sm:inline" : ""}`}>
            OLC
          </span>
        </>
      )}
    </div>
  );
}
