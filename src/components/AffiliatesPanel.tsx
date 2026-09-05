"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  affiliateReferralUrl,
  getOrCreateAffiliateCode,
  loadAffiliateStats,
} from "@/lib/affiliate";
import { accountKeyFromSessionUser } from "@/lib/auth/accountScope";
import { SITE } from "@/lib/site";

export function AffiliatesPanel() {
  const { data: session, status } = useSession();
  const { address } = useAccount();
  const [code, setCode] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const stats = loadAffiliateStats();

  const refresh = useCallback(() => {
    const identity =
      accountKeyFromSessionUser(session?.user) ||
      address ||
      session?.user?.id ||
      null;
    const next = getOrCreateAffiliateCode(identity);
    setCode(next);
    setLink(affiliateReferralUrl(next));
  }, [session?.user, address]);

  useEffect(() => {
    refresh();
    setHydrated(true);
    const onAccount = () => refresh();
    window.addEventListener("olc-account-change", onAccount);
    return () => window.removeEventListener("olc-account-change", onAccount);
  }, [refresh]);

  if (status === "loading" || !hydrated) {
    return <div className="card text-sm text-slate-500">Loading affiliates…</div>;
  }

  if (!session?.user) {
    return (
      <div className="card space-y-5 text-center">
        <p className="text-lg font-semibold text-white">Affiliate dashboard</p>
        <p className="text-sm text-slate-400">
          Sign in to get a stable referral link tied to your OVERLANDCOIN account. Referral
          earnings sync when the affiliate backend ships — until then stats stay at zero.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/login?callbackUrl=/affiliates" className="btn-primary">
            Sign in
          </Link>
          <Link href="/register" className="btn-secondary">
            Create account
          </Link>
        </div>
        <p className="text-xs text-slate-500">No KYC. Wallet optional until you claim rewards.</p>
      </div>
    );
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card border-gold/40 shadow-gold space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Your referral link</p>
            <h2 className="mt-1 text-xl font-bold text-white">Share OVERLANDCOIN</h2>
            <p className="mt-1 text-sm text-slate-400">
              Code is stable for{" "}
              <span className="font-mono text-cyan-100">
                {session.user.accountKey || session.user.address || session.user.id}
              </span>
              . Stored locally until server-side affiliate tracking is live.
            </p>
          </div>
          <span className="badge">Code · {code}</span>
        </div>
        <button
          type="button"
          onClick={() => void onCopy()}
          className="flex w-full min-w-0 items-center gap-2 rounded-xl border border-border bg-bg-panel px-3 py-3 text-left font-mono text-xs text-slate-200 hover:border-gold/40 sm:text-sm"
        >
          <span className="min-w-0 flex-1 break-all">{link}</span>
          <span className="shrink-0 text-gold-bright">{copied ? "Copied" : "Copy"}</span>
        </button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="card !p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Referrals</p>
          <p className="mt-2 text-3xl font-bold text-gold-bright">{stats.referrals}</p>
          <p className="mt-1 text-xs text-slate-500">
            Honest empty until affiliate backend records signups / buys.
          </p>
        </div>
        <div className="card !p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">OLC earned from affiliates</p>
          <p className="mt-2 text-3xl font-bold text-gold-bright">{stats.olcEarned}</p>
          <p className="mt-1 text-xs text-slate-500">No fake balances — payouts need server tracking.</p>
        </div>
      </section>

      <section className="card space-y-3">
        <h3 className="text-lg font-semibold text-white">How it works</h3>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-400">
          <li>Share your referral link with fellow overlanders.</li>
          <li>They join via the link and buy on Presale or complete quests.</li>
          <li>
            When affiliate rewards go live, OLC earned from referred activity will show here and
            claim via the existing Claim / wallet flows — no KYC, no staking.
          </li>
        </ol>
        <p className="text-xs text-slate-500">
          Support:{" "}
          <a href={`mailto:${SITE.supportEmail}`} className="link-accent">
            {SITE.supportEmail}
          </a>
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Link href="/presale" className="btn-primary !py-2 !text-xs">
            Open Presale
          </Link>
          <Link href="/claim" className="btn-secondary !py-2 !text-xs">
            Claim hub
          </Link>
        </div>
      </section>
    </div>
  );
}
