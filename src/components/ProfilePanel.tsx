"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { ConnectWallet } from "@/components/ConnectWallet";
import { useWeb3Mounted } from "@/components/providers/Web3Provider";
import { useLockedOlcBalance } from "@/components/presale/useLockedOlcBalance";
import {
  loadCompletions,
  totalClaimedOlC,
  totalPendingOlC,
} from "@/lib/completions";
import {
  explorerRank,
  formatOlc,
  loadExplorerProfile,
  saveExplorerProfile,
  shortWallet,
} from "@/lib/explorerProfile";
import { getQuestById } from "@/lib/quests";
import { loadPurchases, type LocalPurchase } from "@/lib/purchases";

function purchaseOlc(p: LocalPurchase): number {
  if (typeof p.olcAmount === "number" && Number.isFinite(p.olcAmount)) return p.olcAmount;
  const n = Number(String(p.olcEstimated).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function ProfilePanel() {
  const web3Mounted = useWeb3Mounted();
  if (!web3Mounted) {
    return <div className="card text-sm text-slate-500">Loading profile…</div>;
  }
  return <ProfilePanelInner />;
}

function ProfilePanelInner() {
  const { data: session, status } = useSession();
  const { address, isConnected } = useAccount();
  const wallet = address || session?.user?.address || undefined;
  const { locked, loading: lockedLoading } = useLockedOlcBalance(wallet);

  const [hydrated, setHydrated] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftBio, setDraftBio] = useState("");
  const [completions, setCompletions] = useState(loadCompletions());
  const [purchases, setPurchases] = useState<LocalPurchase[]>([]);
  const [busyOut, setBusyOut] = useState(false);

  const refresh = useCallback(() => {
    const profile = loadExplorerProfile();
    setDisplayName(profile.displayName);
    setBio(profile.bio);
    setCompletions(loadCompletions());
    setPurchases(loadPurchases());
  }, []);

  useEffect(() => {
    refresh();
    setHydrated(true);
    const onAccount = () => refresh();
    window.addEventListener("olc-account-change", onAccount);
    return () => window.removeEventListener("olc-account-change", onAccount);
  }, [refresh]);

  const pending = useMemo(() => totalPendingOlC(completions), [completions]);
  const claimed = useMemo(() => totalClaimedOlC(completions), [completions]);
  const questsDone = completions.length;
  const rank = explorerRank(questsDone);

  const sessionName = session?.user?.name?.trim() || "";
  const shownName =
    displayName || sessionName || (wallet ? shortWallet(wallet) : "Explorer");
  const initial = (shownName[0] || "?").toUpperCase();

  function startEdit() {
    setDraftName(displayName || sessionName);
    setDraftBio(bio);
    setEditing(true);
  }

  function saveEdit() {
    const saved = saveExplorerProfile({ displayName: draftName, bio: draftBio });
    setDisplayName(saved.displayName);
    setBio(saved.bio);
    setEditing(false);
  }

  if (status === "loading" || !hydrated) {
    return <div className="card text-sm text-slate-500">Loading profile…</div>;
  }

  if (!session?.user) {
    return (
      <div className="card space-y-4 text-center">
        <p className="text-lg font-semibold text-white">Sign in to view your profile</p>
        <p className="text-sm text-slate-400">
          Wallet or email login unlocks your explorer profile, locked OLC summaries, and purchase
          history on this device.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link href="/login" className="btn-primary">
            Sign in
          </Link>
          <Link href="/register" className="btn-secondary">
            Create profile
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600/80 to-gold text-3xl font-black text-white shadow-gold">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{shownName}</h1>
              <span className="badge !text-[10px] text-gold-bright">{rank}</span>
            </div>
            {session.user.email && (
              <p className="mt-1 text-sm text-slate-500">{session.user.email}</p>
            )}
            <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
              Signed in via {session.user.loginMethod}
            </p>

            {editing ? (
              <div className="mt-4 space-y-2">
                <label className="block text-xs text-slate-400">
                  Display name
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    maxLength={48}
                    className="mt-1 w-full rounded-lg border border-border bg-bg-deep px-3 py-2 text-sm text-white outline-none focus:border-gold/50"
                    placeholder="Explorer name"
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Bio
                  <textarea
                    value={draftBio}
                    onChange={(e) => setDraftBio(e.target.value)}
                    maxLength={280}
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-border bg-bg-deep px-3 py-2 text-sm text-white outline-none focus:border-gold/50"
                    placeholder="Add a bio…"
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primary !py-1.5 !text-xs" onClick={saveEdit}>
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn-secondary !py-1.5 !text-xs"
                    onClick={() => setEditing(false)}
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Saved on this device under your account key (not a server profile yet).
                </p>
              </div>
            ) : (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-start gap-2">
                  <p className="text-sm text-slate-400">{bio || "No bio yet"}</p>
                  <button
                    type="button"
                    onClick={startEdit}
                    className="shrink-0 text-xs text-gold-bright hover:underline"
                  >
                    Edit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-bg-panel/80 p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Connected wallet</p>
            {isConnected && address ? (
              <p className="mt-1 font-mono text-sm text-cyan-accent">{shortWallet(address)}</p>
            ) : session.user.address ? (
              <p className="mt-1 font-mono text-sm text-cyan-accent">
                {shortWallet(session.user.address)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-slate-400">No wallet connected</p>
            )}
          </div>
          <ConnectWallet compact />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/dashboard" className="btn-secondary !py-2 !text-xs">
            Dashboard
          </Link>
          <Link href="/garage" className="btn-secondary !py-2 !text-xs">
            Garage
          </Link>
          <button
            type="button"
            className="btn-secondary !py-2 !text-xs text-slate-300"
            disabled={busyOut}
            onClick={() => {
              setBusyOut(true);
              void signOut({ callbackUrl: "/" }).finally(() => setBusyOut(false));
            }}
          >
            {busyOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          {
            label: "Locked OLC",
            value: lockedLoading && locked == null ? "…" : formatOlc(locked ?? 0),
            hint: "Presale lock",
          },
          { label: "Pending claim", value: formatOlc(pending), hint: "Quest rewards" },
          { label: "Claimed OLC", value: formatOlc(claimed), hint: "To wallet" },
          { label: "Quests done", value: String(questsDone), hint: rank },
        ].map((stat) => (
          <div key={stat.label} className="card !p-4 text-center">
            <p className="text-xl font-black text-gold-bright sm:text-2xl">{stat.value}</p>
            <p className="mt-1 text-xs text-slate-400">{stat.label}</p>
            <p className="text-[10px] text-slate-600">{stat.hint}</p>
          </div>
        ))}
      </section>

      <section className="card">
        <h2 className="text-lg font-bold text-white">Recent purchases</h2>
        <p className="mt-1 text-xs text-slate-500">From your local purchase ledger on this device.</p>
        {purchases.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">
            No purchases yet.{" "}
            <Link href="/presale" className="link-accent">
              Join Presale
            </Link>
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-border/80">
            {purchases.slice(0, 8).map((p) => (
              <li key={p.id || p.txHash} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-white">
                    {formatOlc(purchaseOlc(p))} OLC · {p.payAsset}
                  </p>
                  <p className="text-xs text-slate-500">
                    {new Date(p.timestamp).toLocaleString()} · {p.status}
                  </p>
                </div>
                <span className="badge !text-[10px]">{p.payMethod || "buy"}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="text-lg font-bold text-white">Completed quests</h2>
        {completions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            No check-ins yet.{" "}
            <Link href="/map" className="link-accent">
              Explore Quest Map
            </Link>
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {completions.slice(0, 6).map((c) => {
              const q = getQuestById(c.questId);
              return (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-bg-panel/60 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      {q?.title ?? c.questId}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {new Date(c.completedAt).toLocaleDateString()} · {c.status}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-gold-bright">
                    +{c.olcEarned}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/feed" className="btn-secondary !py-2 !text-xs">
            Adventure Feed
          </Link>
          <Link href="/map" className="btn-primary !py-2 !text-xs">
            Quest Map
          </Link>
        </div>
      </section>
    </div>
  );
}
