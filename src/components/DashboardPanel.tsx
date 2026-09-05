"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useWeb3Mounted } from "@/components/providers/Web3Provider";
import { useLockedOlcBalance } from "@/components/presale/useLockedOlcBalance";
import {
  loadCompletions,
  loadPosts,
  totalClaimedOlC,
  totalPendingOlC,
  type FeedPost,
} from "@/lib/completions";
import {
  explorerRank,
  formatOlc,
  loadExplorerProfile,
  shortWallet,
} from "@/lib/explorerProfile";
import { getQuestById } from "@/lib/quests";
import { loadPurchases, sumLocalLockedOlc } from "@/lib/purchases";

const SHORTCUTS = [
  { href: "/map", label: "Quest Map", hint: "Find & check in" },
  { href: "/presale", label: "Presale", hint: "Buy locked OLC" },
  { href: "/claim", label: "Claim", hint: "Quest + lock retry" },
  { href: "/feed", label: "Community", hint: "Adventure wall" },
  { href: "/affiliates", label: "Affiliates", hint: "Referral link" },
  { href: "/token-distribution", label: "Token Dist.", hint: "Locked OLC" },
  { href: "/garage", label: "Garage", hint: "Your rig" },
  { href: "/profile", label: "Profile", hint: "Account" },
] as const;

export function DashboardPanel() {
  const web3Mounted = useWeb3Mounted();
  if (!web3Mounted) {
    return <div className="card text-sm text-slate-500">Loading dashboard…</div>;
  }
  return <DashboardPanelInner />;
}

function DashboardPanelInner() {
  const { data: session, status } = useSession();
  const { address } = useAccount();
  const wallet = address || session?.user?.address || undefined;
  const { locked, loading: lockedLoading } = useLockedOlcBalance(wallet);

  const [hydrated, setHydrated] = useState(false);
  const [questsDone, setQuestsDone] = useState(0);
  const [pending, setPending] = useState(0);
  const [claimed, setClaimed] = useState(0);
  const [localLocked, setLocalLocked] = useState(0);
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [displayName, setDisplayName] = useState("");
  const [recentCompletions, setRecentCompletions] = useState<
    ReturnType<typeof loadCompletions>
  >([]);

  const refresh = useCallback(() => {
    const completions = loadCompletions();
    setQuestsDone(completions.length);
    setPending(totalPendingOlC(completions));
    setClaimed(totalClaimedOlC(completions));
    setLocalLocked(sumLocalLockedOlc(wallet));
    setPosts(loadPosts().slice(0, 5));
    setPurchaseCount(loadPurchases().length);
    setRecentCompletions(loadCompletions().slice(0, 5));
    const profile = loadExplorerProfile();
    setDisplayName(profile.displayName);
  }, [wallet]);

  useEffect(() => {
    refresh();
    setHydrated(true);
    const onAccount = () => refresh();
    window.addEventListener("olc-account-change", onAccount);
    return () => window.removeEventListener("olc-account-change", onAccount);
  }, [refresh]);

  const greeting = useMemo(() => {
    const raw =
      displayName ||
      session?.user?.name?.trim() ||
      (wallet ? shortWallet(wallet) : "") ||
      "Explorer";
    return raw.split(" ")[0] || "Explorer";
  }, [displayName, session?.user?.name, wallet]);

  const rank = explorerRank(questsDone);
  const lockedDisplay = locked ?? localLocked;

  if (status === "loading" || !hydrated) {
    return <div className="card text-sm text-slate-500">Loading dashboard…</div>;
  }

  if (!session?.user) {
    return (
      <div className="card space-y-5 text-center">
        <p className="text-lg font-semibold text-white">Explorer Dashboard</p>
        <p className="text-sm text-slate-400">
          Sign in to see locked OLC, quest progress, and your recent adventure feed. Progress on
          this device is namespaced to your account after login.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/login?callbackUrl=/dashboard" className="btn-primary">
            Sign in
          </Link>
          <Link href="/register" className="btn-secondary">
            Create profile
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-2 sm:grid-cols-3">
          {SHORTCUTS.slice(0, 3).map((s) => (
            <Link key={s.href} href={s.href} className="btn-secondary !py-2 !text-xs">
              {s.label}
            </Link>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-white sm:text-3xl">Explorer Dashboard</h2>
          <p className="mt-1 text-sm text-slate-500">
            Welcome back,{" "}
            <span className="font-semibold text-gold-bright">{greeting}</span>
            {session.user.email ? ` · ${session.user.email}` : ""}
          </p>
        </div>
        <div className="rounded-2xl border border-gold/30 bg-bg-card px-5 py-3 shadow-gold">
          <p className="text-xs text-slate-500">Explorer Rank</p>
          <p className="text-sm font-black text-gold-bright">{rank}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          {
            label: "Locked OLC",
            value: lockedLoading && locked == null ? "…" : formatOlc(lockedDisplay),
            color: "text-gold-bright",
          },
          {
            label: "Quests done",
            value: String(questsDone),
            color: "text-emerald-400",
          },
          {
            label: "Quest earnings",
            value: formatOlc(pending + claimed),
            color: "text-cyan-accent",
          },
          {
            label: "Purchases",
            value: String(purchaseCount),
            color: "text-purple-300",
          },
        ].map((s) => (
          <div key={s.label} className="card !p-4">
            <p className={`text-xl font-black sm:text-2xl ${s.color}`}>{s.value}</p>
            <p className="mt-1 text-xs text-slate-500">{s.label}</p>
          </div>
        ))}
      </div>

      <section className="card">
        <h3 className="font-bold text-white">Shortcuts</h3>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {SHORTCUTS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="rounded-xl border border-border bg-bg-panel/80 px-3 py-3 text-center transition hover:border-gold/40 hover:shadow-gold"
            >
              <span className="block text-sm font-semibold text-white">{s.label}</span>
              <span className="mt-0.5 block text-[10px] text-slate-500">{s.hint}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-white">Recent feed posts</h3>
          <Link href="/feed" className="text-xs text-cyan-accent hover:text-gold-bright">
            Open Feed →
          </Link>
        </div>
        {posts.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            No local adventure posts yet. Complete a quest on the{" "}
            <Link href="/map" className="link-accent">
              Quest Map
            </Link>{" "}
            to share GPS + photo proof.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {posts.map((p) => (
              <li
                key={p.id}
                className="flex gap-3 rounded-xl border border-border bg-bg-panel/60 p-3"
              >
                {p.photoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.photoDataUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-bg-deep text-[10px] text-slate-600">
                    Photo
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">{p.questTitle}</p>
                  <p className="text-[11px] text-slate-500">
                    {p.region} · {new Date(p.createdAt).toLocaleDateString()}
                  </p>
                  <p className="text-xs font-semibold text-gold-bright">+{p.olcEarned} OLC</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h3 className="font-bold text-white">Latest quest completions</h3>
        {questsDone === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            Head to the map to start exploring — ranks climb from Novice → Legend.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border/80">
            {recentCompletions.map((c) => {
              const q = getQuestById(c.questId);
              return (
                <li key={c.id} className="flex justify-between gap-3 py-2.5 text-sm">
                  <span className="truncate text-slate-300">{q?.title ?? c.questId}</span>
                  <span className="shrink-0 text-gold-bright">+{c.olcEarned}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-center text-xs text-slate-600">
        Card checkout is a later follow-up. Staking is not part of this app surface.
      </p>
    </div>
  );
}
