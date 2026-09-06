"use client";

import { useCallback } from "react";
import { useAccount, useBalance, useChainId, useReadContract } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { TOKEN } from "@/lib/token";

/** Readable native/ERC-20 amount (not wei). Up to `maxFrac` fraction digits. */
export function formatTokenAmount(
  value: bigint | undefined,
  decimals = 18,
  maxFrac = 4,
  opts?: { compact?: boolean },
): string {
  if (value == null) return "…";
  try {
    const n = Number(formatUnits(value, decimals));
    if (!Number.isFinite(n)) return "—";
    if (n === 0) return "0";
    if (n > 0 && n < 1 / 10 ** maxFrac) return `<${(1 / 10 ** maxFrac).toFixed(maxFrac)}`;
    if (opts?.compact) {
      const trim = (s: string) => s.replace(/\.0+$/, "").replace(/(\.[0-9]*?)0+$/, "$1");
      if (n >= 1_000_000_000) return `${trim((n / 1_000_000_000).toFixed(2))}B`;
      if (n >= 1_000_000) return `${trim((n / 1_000_000).toFixed(2))}M`;
      if (n >= 10_000) return `${trim((n / 1_000).toFixed(2))}K`;
    }
    return n.toLocaleString("en-US", {
      maximumFractionDigits: maxFrac,
      minimumFractionDigits: 0,
    });
  } catch {
    return "—";
  }
}

/**
 * Native BDAG (chain 1404) + optional OLC ERC-20 for the connected wallet.
 * Queries BlockDAG explicitly — only treat as displayable when wallet is on 1404.
 * (wagmi v3 useBalance is native-only; OLC uses useReadContract balanceOf.)
 */
export function useWalletBalances(opts?: {
  /** Poll interval ms (default 20s). Pass false to disable. */
  refetchInterval?: number | false;
  /** Include OLC ERC-20 balance (default true). */
  includeOlc?: boolean;
}) {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const onCorrectChain = isConnected && chainId === TOKEN.chainId;
  const interval = opts?.refetchInterval === false ? false : (opts?.refetchInterval ?? 20_000);
  const includeOlc = opts?.includeOlc !== false;
  const enabled = Boolean(address) && isConnected;

  const native = useBalance({
    address,
    chainId: TOKEN.chainId,
    query: {
      enabled,
      refetchInterval: interval,
    },
  });

  const olc = useReadContract({
    address: TOKEN.contractAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: TOKEN.chainId,
    query: {
      enabled: enabled && includeOlc && Boolean(address),
      refetchInterval: interval,
    },
  });

  const refetchNative = native.refetch;
  const refetchOlc = olc.refetch;
  const refetch = useCallback(async () => {
    await Promise.all([
      refetchNative(),
      includeOlc ? refetchOlc() : Promise.resolve(),
    ]);
  }, [refetchNative, refetchOlc, includeOlc]);

  const olcValue =
    onCorrectChain && includeOlc && typeof olc.data === "bigint" ? olc.data : undefined;

  return {
    address,
    isConnected,
    onCorrectChain,
    chainId,
    /** Native BDAG — only show when onCorrectChain (avoid wrong-chain confusion). */
    bdagValue: onCorrectChain ? native.data?.value : undefined,
    bdagFormatted: onCorrectChain
      ? formatTokenAmount(native.data?.value, TOKEN.nativeCurrency.decimals, 4)
      : null,
    bdagLoading: native.isLoading || native.isFetching,
    olcValue,
    olcFormatted:
      onCorrectChain && includeOlc
        ? formatTokenAmount(olcValue, TOKEN.decimals, 4, { compact: true })
        : null,
    olcLoading: includeOlc && (olc.isLoading || olc.isFetching),
    refetch,
  };
}
