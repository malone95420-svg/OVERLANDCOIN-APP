"use client";

import { useCallback, useEffect, useState } from "react";
import { explorerTxUrl } from "@/lib/token";

type RecentBuy = {
  id: string;
  buyer: string;
  buyerMasked?: string;
  olcAmount: number;
  payAsset: string;
  ts: number;
  paymentTxHash?: string;
  deliveryTxHash?: string;
};

const POLL_MS = 15_000;

function formatOlc(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const sec = Math.floor(diff / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function mask(addr: string): string {
  if (addr.includes("…") || addr.includes("...")) return addr;
  if (addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Public live feed of successful OLC deliveries (polls /api/presale/recent). */
export function RecentBuysFeed() {
  const [buys, setBuys] = useState<RecentBuy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [durable, setDurable] = useState<boolean | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/presale/recent?limit=30", { cache: "no-store" });
      const json = (await res.json()) as {
        buys?: RecentBuy[];
        durable?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`);
        return;
      }
      setBuys(Array.isArray(json.buys) ? json.buys : []);
      setDurable(typeof json.durable === "boolean" ? json.durable : null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load recent buys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <section className="card !p-4 border-gold/20">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Recent Buys</h2>
          <p className="text-[11px] text-slate-500">
            Public feed of verified deliveries · updates every ~15s
            {durable === false ? " · in-memory (set Upstash Redis for durability)" : ""}
          </p>
        </div>
        <button
          type="button"
          className="rounded border border-border px-2 py-0.5 text-[11px] text-slate-300 hover:border-gold/40"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </div>

      {loading && buys.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Loading…</p>
      ) : buys.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No public buys yet</p>
      ) : (
        <ul className="mt-3 divide-y divide-border/60">
          {buys.map((b) => {
            const explorerHash =
              b.deliveryTxHash?.startsWith("0x")
                ? b.deliveryTxHash
                : b.paymentTxHash?.startsWith("0x")
                  ? b.paymentTxHash
                  : null;
            return (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs first:pt-1"
              >
                <div className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-mono text-slate-300">
                    {mask(b.buyerMasked || b.buyer)}
                  </span>
                  <span className="text-gold-bright font-semibold">
                    {formatOlc(b.olcAmount)} OLC
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-cyan-accent">
                    {b.payAsset}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <span title={new Date(b.ts).toLocaleString()}>{relativeTime(b.ts)}</span>
                  {explorerHash && (
                    <a
                      className="link-accent font-mono"
                      href={explorerTxUrl(explorerHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      tx
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {error && <p className="mt-2 text-[11px] text-amber-300/90">{error}</p>}
    </section>
  );
}
