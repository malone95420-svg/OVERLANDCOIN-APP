"use client";

import { useCallback, useEffect, useState } from "react";
import { sumLocalLockedOlc } from "@/lib/purchases";

type LockedBalanceApi = {
  locked: number;
  totalLocked?: number;
  error?: string;
};

/**
 * Polls /api/presale/locked-balance and merges with local pending credits.
 * Call refresh() after a successful buy so the number updates without a full page reload.
 */
export function useLockedOlcBalance(address: string | undefined) {
  const [apiLocked, setApiLocked] = useState<number | null>(null);
  const [localSum, setLocalSum] = useState(0);
  const [loading, setLoading] = useState(false);

  const refreshLocal = useCallback(() => {
    setLocalSum(sumLocalLockedOlc(address));
  }, [address]);

  const refresh = useCallback(async () => {
    refreshLocal();
    if (!address) {
      setApiLocked(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/presale/locked-balance?address=${encodeURIComponent(address)}`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => ({}))) as LockedBalanceApi;
      if (typeof data.locked === "number" && Number.isFinite(data.locked)) {
        setApiLocked(data.locked);
      }
    } catch {
      /* keep last known */
    } finally {
      setLoading(false);
      refreshLocal();
    }
  }, [address, refreshLocal]);

  useEffect(() => {
    void refresh();
    if (!address) return;
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [address, refresh]);

  const display =
    apiLocked != null ? Math.max(apiLocked, localSum) : localSum > 0 ? localSum : null;

  return { locked: display, apiLocked, localSum, loading, refresh };
}
