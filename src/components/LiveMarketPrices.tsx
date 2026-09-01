"use client";

import { formatUsdPrice, type LivePricesResponse } from "@/lib/livePrices";
import { useLivePrices } from "@/hooks/useLivePrices";

type Row = {
  id: string;
  symbol: string;
  get: (p: LivePricesResponse) => number | null;
  sourceKey: string;
};

const ROWS: Row[] = [
  { id: "bdag", symbol: "BDAG", get: (p) => p.bdagUsd, sourceKey: "bdag" },
  { id: "btc", symbol: "BTC", get: (p) => p.btcUsd, sourceKey: "btc" },
  { id: "eth", symbol: "ETH", get: (p) => p.ethUsd, sourceKey: "eth" },
  { id: "usdt", symbol: "USDT", get: (p) => p.usdtUsd, sourceKey: "usdt" },
  { id: "usdc", symbol: "USDC", get: (p) => p.usdcUsd, sourceKey: "usdc" },
  { id: "bdusd", symbol: "BDUSD", get: (p) => p.bdusdUsd, sourceKey: "bdusd" },
];

function formatUpdated(ts: number | null | undefined): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/Denver",
    });
  } catch {
    return "";
  }
}

/** Compact live market strip — display only; Buy still needs on-chain pay tokens. */
export function LiveMarketPrices() {
  const prices = useLivePrices();

  return (
    <section className="card !p-4 border-cyan-accent/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Live market prices</h2>
          <p className="text-[11px] text-slate-500">
            USD spots for accepted cryptos. On-chain Buy: BDAG/BDUSD (+ env tokens). External deposits when configured.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-500">
          {prices.loading ? (
            <span>Loading…</span>
          ) : (
            <span>
              Updated {formatUpdated(prices.updatedAt)} MT
              {prices.source ? ` · BDAG via ${prices.source}` : ""}
            </span>
          )}
          <button
            type="button"
            className="rounded border border-border px-2 py-0.5 text-slate-300 hover:border-gold/40"
            onClick={() => void prices.refresh()}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {ROWS.map((row) => {
          const usd = row.get(prices);
          const src = prices.sources?.[row.sourceKey];
          return (
            <div
              key={row.id}
              className="rounded-lg border border-border bg-bg-panel/60 px-3 py-2"
            >
              <p className="text-[10px] uppercase tracking-wide text-slate-500">{row.symbol}</p>
              <p className="mt-0.5 font-mono text-sm font-semibold text-gold-bright">
                ${formatUsdPrice(usd, row.id === "bdag" ? 8 : 4)}
              </p>
              <p className="text-[10px] text-slate-600">{src ?? (usd == null ? "—" : "")}</p>
            </div>
          );
        })}
      </div>

      {prices.error && (
        <p className="mt-2 text-[11px] text-amber-300/90">{prices.error}</p>
      )}
      {prices.bdagUsd == null && prices.staleEstimateUsd != null && (
        <p className="mt-1 text-[11px] text-slate-500">
          Stale estimate only (not for Buy): ${formatUsdPrice(prices.staleEstimateUsd, 6)} BDAG
        </p>
      )}
    </section>
  );
}
