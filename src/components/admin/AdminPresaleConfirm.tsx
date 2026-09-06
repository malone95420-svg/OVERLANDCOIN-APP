"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { explorerTxUrl } from "@/lib/token";

const SECRET_KEY = "olc.presaleAdminSecret";

const ASSETS = ["ETH", "USDT", "USDC", "SOL", "BTC", "BDAG"] as const;

type ConfirmResult = {
  status?: string;
  creditTxHash?: string;
  buyer?: string;
  olcAmount?: number;
  alreadyDelivered?: boolean;
  paymentTxHash?: string;
  payAsset?: string;
  payAmount?: number;
  verified?: boolean;
  forced?: boolean;
  warning?: string;
  error?: string;
  message?: string;
  detail?: string;
  hint?: string;
};

type RecentBuy = {
  id: string;
  buyer: string;
  olcAmount: number;
  payAsset: string;
  ts: number;
  paymentTxHash?: string;
  deliveryTxHash?: string;
};

function inputClass() {
  return "mt-1 w-full min-w-0 rounded-xl border border-border bg-bg-panel px-3 py-2.5 font-mono text-sm text-white";
}

function labelClass() {
  return "text-xs font-medium uppercase tracking-wide text-slate-500";
}

export function AdminPresaleConfirm() {
  const [secret, setSecret] = useState("");
  const [paymentTxHash, setPaymentTxHash] = useState("");
  const [buyer, setBuyer] = useState("");
  const [payAsset, setPayAsset] = useState<(typeof ASSETS)[number]>("ETH");
  const [payAmount, setPayAmount] = useState("");
  const [force, setForce] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);
  const [recent, setRecent] = useState<RecentBuy[]>([]);
  const [listNote, setListNote] = useState<string | null>(null);
  const [listErr, setListErr] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SECRET_KEY);
      if (stored) setSecret(stored);
    } catch {
      /* ignore */
    }
  }, []);

  const persistSecret = useCallback((value: string) => {
    setSecret(value);
    try {
      if (value) sessionStorage.setItem(SECRET_KEY, value);
      else sessionStorage.removeItem(SECRET_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const adminHeaders = useCallback((): HeadersInit => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (secret.trim()) {
      h.Authorization = `Bearer ${secret.trim()}`;
      h["x-presale-admin-secret"] = secret.trim();
    }
    return h;
  }, [secret]);

  const loadRecent = useCallback(async () => {
    setListErr(null);
    if (!secret.trim()) {
      setListErr("Enter admin secret to load recent buys.");
      return;
    }
    try {
      const res = await fetch("/api/presale/admin/confirm?limit=30", {
        headers: adminHeaders(),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as {
        recentBuys?: RecentBuy[];
        note?: string;
        error?: string;
      };
      if (!res.ok) {
        setListErr(data.error || `HTTP ${res.status}`);
        setRecent([]);
        return;
      }
      setRecent(Array.isArray(data.recentBuys) ? data.recentBuys : []);
      setListNote(data.note ?? null);
    } catch (e) {
      setListErr(e instanceof Error ? e.message : "List failed");
    }
  }, [adminHeaders, secret]);

  const onConfirm = useCallback(async () => {
    setResult(null);
    setHttpStatus(null);
    if (!secret.trim()) {
      setResult({ error: "Admin secret required" });
      return;
    }
    if (!paymentTxHash.trim() || !buyer.trim()) {
      setResult({ error: "payment tx hash and buyer wallet are required" });
      return;
    }
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        paymentTxHash: paymentTxHash.trim(),
        buyer: buyer.trim(),
        payAsset,
      };
      const amt = Number(String(payAmount).replace(/,/g, ""));
      if (Number.isFinite(amt) && amt > 0) body.payAmount = amt;
      if (force) body.force = true;

      const res = await fetch("/api/presale/admin/confirm", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as ConfirmResult;
      setHttpStatus(res.status);
      setResult(data);
      if (res.ok && data.status === "delivered") {
        void loadRecent();
      }
    } catch (e) {
      setResult({ error: e instanceof Error ? e.message : "Request failed" });
    } finally {
      setBusy(false);
    }
  }, [
    adminHeaders,
    buyer,
    force,
    loadRecent,
    payAmount,
    payAsset,
    paymentTxHash,
    secret,
  ]);

  const ok =
    result &&
    (result.status === "delivered" || result.alreadyDelivered) &&
    result.creditTxHash;

  return (
    <div className="space-y-6">
      <section className="card space-y-4 border-amber-500/40">
        <div>
          <h2 className="text-xl font-bold text-white">Admin confirm purchase</h2>
          <p className="mt-1 text-sm text-slate-400">
            Confirm a past pending deposit (ETH / USDT / USDC / SOL / BTC) and deliver OLC
            ERC-20 to the buyer&apos;s BlockDAG wallet. Uses the same verify + deliver path as
            public confirm-deposit. Secret is stored only in{" "}
            <code className="text-slate-300">sessionStorage</code> for this browser session —
            never commit it.
          </p>
        </div>

        <div>
          <label className={labelClass()} htmlFor="admin-secret">
            Admin secret
          </label>
          <input
            id="admin-secret"
            type="password"
            autoComplete="off"
            className={inputClass()}
            value={secret}
            onChange={(e) => persistSecret(e.target.value)}
            placeholder="PRESALE_ADMIN_SECRET"
          />
        </div>

        <div>
          <label className={labelClass()} htmlFor="admin-tx">
            Payment tx hash / explorer link
          </label>
          <input
            id="admin-tx"
            className={inputClass()}
            value={paymentTxHash}
            onChange={(e) => setPaymentTxHash(e.target.value)}
            placeholder="0x… / txid / https://etherscan.io/tx/…"
          />
        </div>

        <div>
          <label className={labelClass()} htmlFor="admin-buyer">
            Buyer BlockDAG wallet (receives OLC)
          </label>
          <input
            id="admin-buyer"
            className={inputClass()}
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
            placeholder="0x…"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass()} htmlFor="admin-asset">
              Pay asset
            </label>
            <select
              id="admin-asset"
              className={inputClass()}
              value={payAsset}
              onChange={(e) =>
                setPayAsset(e.target.value as (typeof ASSETS)[number])
              }
            >
              {ASSETS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass()} htmlFor="admin-amount">
              Pay amount (optional; required if force)
            </label>
            <input
              id="admin-amount"
              className={inputClass()}
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              placeholder="e.g. 0.05 ETH"
            />
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            className="mt-1"
            checked={force}
            onChange={(e) => setForce(e.target.checked)}
          />
          <span>
            <strong className="text-amber-300">force</strong> — skip on-chain verify and credit
            using payAmount (only if verify fails; labeled for BTC explorer flakiness). Prefer
            verify-first; leave unchecked.
          </span>
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-primary disabled:opacity-40"
            disabled={busy}
            onClick={() => void onConfirm()}
          >
            {busy ? "Confirming…" : "Verify & deliver OLC"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void loadRecent()}
          >
            Refresh recent buys
          </button>
          <Link href="/claim" className="btn-secondary">
            Claim hub
          </Link>
        </div>

        {result && (
          <div
            className={`rounded-xl border p-4 text-sm ${
              ok
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-100"
                : "border-rose-500/40 bg-rose-500/10 text-rose-100"
            }`}
          >
            {ok ? (
              <>
                <p className="font-semibold text-white">
                  {result.alreadyDelivered
                    ? "Already delivered (idempotent)"
                    : result.forced
                      ? "Delivered with force override"
                      : "Delivered"}
                  {typeof result.olcAmount === "number"
                    ? ` — ${result.olcAmount.toLocaleString()} OLC`
                    : ""}
                </p>
                {result.creditTxHash && (
                  <p className="mt-2 font-mono text-xs break-all">
                    Delivery tx:{" "}
                    <a
                      href={explorerTxUrl(result.creditTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-accent"
                    >
                      {result.creditTxHash}
                    </a>
                  </p>
                )}
                {result.warning && (
                  <p className="mt-2 text-amber-200">{result.warning}</p>
                )}
              </>
            ) : (
              <>
                <p className="font-semibold text-white">
                  {result.error || result.message || "Confirm failed"}
                  {httpStatus != null ? ` (HTTP ${httpStatus})` : ""}
                </p>
                {result.detail && result.detail !== result.error && (
                  <p className="mt-1 text-xs text-rose-200/80 break-all">
                    {result.detail}
                  </p>
                )}
                {result.hint && (
                  <p className="mt-2 text-amber-200">{result.hint}</p>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h3 className="text-lg font-bold text-white">Recent deliveries (ops context)</h3>
        {listNote && <p className="text-xs text-slate-500">{listNote}</p>}
        {listErr && <p className="text-xs text-rose-300">{listErr}</p>}
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">
            No recent buys loaded. Enter secret and tap Refresh — or confirm by pasting a past
            payment tx above (there is no pending DB to invent).
          </p>
        ) : (
          <ul className="space-y-2">
            {recent.map((b) => (
              <li
                key={b.id}
                className="rounded-xl border border-border bg-bg-panel/60 px-3 py-2 text-xs font-mono text-slate-300"
              >
                <span className="text-gold-bright">
                  {b.olcAmount.toLocaleString()} OLC
                </span>{" "}
                · {b.payAsset} · {b.buyer} ·{" "}
                {new Date(b.ts).toLocaleString()}
                {b.paymentTxHash && (
                  <>
                    {" "}
                    · pay {b.paymentTxHash.slice(0, 12)}…
                  </>
                )}
                {b.deliveryTxHash && (
                  <>
                    {" "}
                    ·{" "}
                    <a
                      href={explorerTxUrl(b.deliveryTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-accent"
                    >
                      delivery
                    </a>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
