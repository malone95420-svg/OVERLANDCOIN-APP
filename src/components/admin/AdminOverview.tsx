"use client";

import { useCallback, useEffect, useState } from "react";
import { explorerAddressUrl } from "@/lib/token";

const SECRET_KEY = "olc.presaleAdminSecret";

type WalletInfo = {
  address: string | null;
  balanceWei: string | null;
  balanceOlc: string | null;
};

type Overview = {
  chainId: number;
  chainName: string;
  rewardWallet: WalletInfo;
  deliverWallet: WalletInfo;
  totalDeliveredOlc: number;
  totalClaimedOlc: number;
};

function fmtOlc(v: string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function shortAddr(a: string | null | undefined): string {
  if (!a) return "not configured";
  return `${a.slice(0, 10)}…${a.slice(-8)}`;
}

export function AdminOverview() {
  const [secret, setSecret] = useState("");
  const [data, setData] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SECRET_KEY);
      if (stored) setSecret(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const persistSecret = useCallback((v: string) => {
    setSecret(v);
    try {
      if (v) sessionStorage.setItem(SECRET_KEY, v);
      else sessionStorage.removeItem(SECRET_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const headers: Record<string, string> = {};
      if (secret.trim()) {
        headers.Authorization = `Bearer ${secret.trim()}`;
        headers["x-presale-admin-secret"] = secret.trim();
      }
      const res = await fetch("/api/admin/overview", { headers, cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as Overview & { error?: string };
      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`);
        setData(null);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }, [secret]);

  return (
    <div className="space-y-6">
      <div className="card">
        <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
          Admin secret
        </label>
        <input
          type="password"
          value={secret}
          onChange={(e) => persistSecret(e.target.value)}
          placeholder="PRESALE_ADMIN_SECRET"
          className="mt-1 w-full min-w-0 rounded-xl border border-border bg-bg-panel px-3 py-2.5 font-mono text-sm text-white"
        />
        <button
          type="button"
          className="btn-primary mt-3"
          onClick={() => void load()}
          disabled={busy || !secret.trim()}
        >
          {busy ? "Loading…" : "Load balances"}
        </button>
      </div>

      {error && <p className="text-sm text-red-300">{error}</p>}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-accent">
                Presale deliver wallet
              </p>
              <p className="mt-2 text-2xl font-bold text-gold-bright">
                {fmtOlc(data.deliverWallet.balanceOlc)} OLC
              </p>
              <p className="mt-1 break-all font-mono text-xs text-slate-400">
                {shortAddr(data.deliverWallet.address)}
              </p>
              {data.deliverWallet.address && (
                <a
                  href={explorerAddressUrl(data.deliverWallet.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-accent mt-2 inline-block text-xs"
                >
                  View on explorer
                </a>
              )}
            </div>
            <div className="card">
              <p className="text-xs font-semibold uppercase tracking-wider text-cyan-accent">
                Quest reward wallet
              </p>
              <p className="mt-2 text-2xl font-bold text-gold-bright">
                {fmtOlc(data.rewardWallet.balanceOlc)} OLC
              </p>
              <p className="mt-1 break-all font-mono text-xs text-slate-400">
                {shortAddr(data.rewardWallet.address)}
              </p>
              {data.rewardWallet.address && (
                <a
                  href={explorerAddressUrl(data.rewardWallet.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-accent mt-2 inline-block text-xs"
                >
                  View on explorer
                </a>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Total OLC sold (presale)
              </p>
              <p className="mt-1 text-2xl font-bold text-white">
                {data.totalDeliveredOlc.toLocaleString("en-US", { maximumFractionDigits: 2 })} OLC
              </p>
            </div>
            <div className="card">
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Total OLC claimed (quests)
              </p>
              <p className="mt-1 text-2xl font-bold text-white">
                {data.totalClaimedOlc.toLocaleString("en-US", { maximumFractionDigits: 2 })} OLC
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Balances are live on-chain ({data.chainName}, chain {data.chainId}). Totals are a
            running counter.
          </p>
        </>
      )}
    </div>
  );
}
