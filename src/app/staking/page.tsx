import type { Metadata } from "next";
import Link from "next/link";
import { SITE, STAKING_PLANS } from "@/lib/site";

export const metadata: Metadata = {
  title: "Staking",
  description: "OVERLANDCOIN staking plans explainer — UI mock only, no live staking contract.",
};

export default function StakingPage() {
  const contractLabel = SITE.stakingContract ? SITE.stakingContract : "(empty — not live)";

  return (
    <div className="container-page py-14">
      <span className="badge">UI preview</span>
      <h1 className="section-title mt-4">Staking</h1>
      <p className="section-sub">
        Planned lock durations and APYs from the public site. This is an explainer and mock UI — there is no live staking contract yet.
      </p>

      <div className="mt-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200">
        <strong>Risk disclaimer:</strong> Cryptocurrency staking involves smart-contract, market, and opportunity risk.
        Nothing on this page is an offer, yield guarantee, or solicitation. APY figures are illustrative placeholders from the prior public UI only.
        Do not send tokens to unverified addresses.
      </div>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STAKING_PLANS.map((plan) => (
          <div key={plan.days} className="card text-center">
            <p className="text-xs uppercase tracking-wide text-slate-500">{plan.days}-day lock</p>
            <p className="mt-2 text-4xl font-extrabold text-gold-bright">{plan.apyPercent}%</p>
            <p className="mt-1 text-xs text-slate-500">Example APY</p>
            <button type="button" disabled className="btn-primary mt-4 w-full cursor-not-allowed opacity-50 !text-xs">
              Stake (coming soon)
            </button>
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <article className="card">
          <h2 className="text-lg font-bold text-gold-bright">How it may work</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-400">
            <li>1. Hold OLC in a self-custody wallet on BlockDAG.</li>
            <li>2. When a staking contract is audited and published, connect and stake from the official UI.</li>
            <li>3. Longer locks show higher example APYs (30d 15% → 365d 120%) — not live rates.</li>
          </ul>
          <p className="mt-4 text-xs text-slate-600">
            Config placeholder: SITE.stakingContract = {contractLabel}
          </p>
        </article>

        <article className="card opacity-90">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">Mock stake panel</h2>
            <span className="badge">Disabled</span>
          </div>
          <div className="mt-6 rounded-xl border border-dashed border-border bg-bg-deep p-6">
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-slate-500">
                Amount: — OLC
              </div>
              <div className="rounded-lg border border-border bg-bg-panel px-3 py-2 text-sm text-slate-500">
                Plan: select a lock above
              </div>
              <button type="button" disabled className="btn-primary w-full cursor-not-allowed opacity-50">
                Stake (coming soon)
              </button>
              <button type="button" disabled className="btn-secondary w-full cursor-not-allowed opacity-50">
                Unstake (coming soon)
              </button>
            </div>
          </div>
        </article>
      </div>

      <p className="mt-8 text-sm text-slate-500">
        Questions? See the <Link href="/faq" className="link-accent">FAQ</Link> or{" "}
        <Link href="/docs" className="link-accent">Docs</Link>.
      </p>
    </div>
  );
}
