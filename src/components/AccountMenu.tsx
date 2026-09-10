"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { ExplorerAvatar } from "@/components/ExplorerAvatar";
import {
  loadExplorerProfile,
  PROFILE_CHANGE_EVENT,
} from "@/lib/explorerProfile";

function shortLabel(name?: string | null, email?: string | null, address?: string | null) {
  if (address) return `${address.slice(0, 6)}…${address.slice(-4)}`;
  if (name) return name.length > 16 ? `${name.slice(0, 14)}…` : name;
  if (email) return email.length > 18 ? `${email.slice(0, 16)}…` : email;
  return "Account";
}

export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { data: session, status } = useSession();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [avatar, setAvatar] = useState("");
  const [displayName, setDisplayName] = useState("");

  useEffect(() => {
    const load = () => {
      const p = loadExplorerProfile();
      setAvatar(p.avatarDataUrl);
      setDisplayName(p.displayName);
    };
    load();
    window.addEventListener(PROFILE_CHANGE_EVENT, load);
    window.addEventListener("olc-account-change", load);
    return () => {
      window.removeEventListener(PROFILE_CHANGE_EVENT, load);
      window.removeEventListener("olc-account-change", load);
    };
  }, [session?.user?.accountKey]);

  if (status === "loading") {
    return (
      <span className="hidden sm:inline-flex rounded-lg border border-border px-3 py-1.5 text-xs text-slate-500">
        …
      </span>
    );
  }

  if (!session?.user) {
    return (
      <Link
        href="/login"
        className={`btn-secondary !py-1.5 !text-xs ${compact ? "!px-2.5 sm:!px-5" : ""}`}
      >
        Account
      </Link>
    );
  }

  const label = shortLabel(
    displayName || session.user.name,
    session.user.email,
    session.user.address,
  );
  const avatarName = displayName || session.user.name || session.user.email || "Explorer";

  return (
    <div className="relative">
      <button
        type="button"
        className={`btn-secondary inline-flex items-center gap-1.5 truncate !py-1.5 !text-xs ${
          compact ? "max-w-[7rem] !px-2 sm:max-w-[11rem] sm:!px-4" : "max-w-[11rem]"
        }`}
        title={session.user.accountKey || session.user.email || undefined}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ExplorerAvatar src={avatar || undefined} name={avatarName} size={22} />
        {label}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close account menu"
            onClick={() => setOpen(false)}
          />
          <div className="fixed left-3 right-3 z-50 top-[calc(env(safe-area-inset-top,0px)+3.75rem)] max-h-[min(70vh,24rem)] overflow-y-auto rounded-xl border border-border bg-bg-card p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom,0px))] shadow-gold sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-52 sm:max-w-none">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-bg-panel hover:text-gold-bright"
            >
              Profile
            </Link>
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-bg-panel hover:text-gold-bright"
            >
              Dashboard
            </Link>
            <Link
              href="/claim"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-bg-panel hover:text-gold-bright"
            >
              Claim
            </Link>
            <Link
              href="/affiliates"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-bg-panel hover:text-gold-bright"
            >
              Affiliates
            </Link>
            <Link
              href="/token-distribution"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-bg-panel hover:text-gold-bright"
            >
              Token Distribution
            </Link>
            <Link
              href="/garage"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-bg-panel hover:text-gold-bright"
            >
              Garage
            </Link>
            <button
              type="button"
              className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm text-slate-400 hover:bg-bg-panel hover:text-white"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setOpen(false);
                void signOut({ callbackUrl: "/" }).finally(() => setBusy(false));
              }}
            >
              {busy ? "…" : "Sign out"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
