"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LivePricesResponse } from "@/lib/livePrices";

const POLL_MS = 60_000;
const CLIENT_TIMEOUT_MS = 12_000;

const EMPTY: LivePricesResponse = {
  bdagUsd: null,
  usdtUsd: 1,
  usdcUsd: 1,
  bdusdUsd: 1,
  ethUsd: null,
  btcUsd: null,
  solUsd: null,
  bnbUsd: null,
  source: null,
  sources: { usdt: "peg", usdc: "peg", bdusd: "peg" },
  updatedAt: 0,
};

export type UseLivePricesState = LivePricesResponse & {
  loading: boolean;
  /** True when bdagUsd is a fresh live quote suitable for BDAG Buy */
  hasLiveBdag: boolean;
  refresh: () => Promise<void>;
};

function isLivePricesResponse(v: unknown): v is LivePricesResponse {
  return Boolean(v) && typeof v === "object" && "updatedAt" in (v as object);
}

export function useLivePrices(): UseLivePricesState {
  const [data, setData] = useState<LivePricesResponse>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
    try {
      const res = await fetch("/api/prices", { cache: "no-store", signal: ctrl.signal });
      const json: unknown = await res.json().catch(() => null);
      if (!mounted.current) return;
      if (!isLivePricesResponse(json)) {
        setFetchError("Invalid prices response");
        return;
      }
      setData(json);
      const missingMajors = json.bdagUsd == null && json.btcUsd == null && json.ethUsd == null;
      setFetchError(
        json.error ??
          (missingMajors
            ? "Live market prices unavailable"
            : json.bdagUsd == null
              ? "Live BDAG price unavailable"
              : null),
      );
    } catch (e) {
      if (!mounted.current) return;
      const aborted = e instanceof DOMException && e.name === "AbortError";
      setFetchError(
        aborted
          ? "Price request timed out — tap Refresh"
          : e instanceof Error
            ? e.message
            : "Failed to load live prices",
      );
    } finally {
      window.clearTimeout(timer);
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setLoading(true);
    void refresh();
    const id = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [refresh]);

  const bdagUsd = data.bdagUsd;

  return {
    ...data,
    error: fetchError ?? data.error,
    loading,
    hasLiveBdag: typeof bdagUsd === "number" && bdagUsd > 0,
    refresh,
  };
}
