"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { useState } from "react";

function shortLabel(name?: string | null, email?: string | null, address?: string | null) {
  if (address) return `${address.slice(0, 6)}…${address.slice(-4)}`;
  if (name) return name.length > 16 ? `${name.slice(0, 14)}…` : name;
  if (email) return email.length > 18 ? `${email.slice(0, 16)}…` : email;
  return "Account";
}

export function AccountMenu() {
  const { data: session, status } = useSession();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (status === "loading") {
    return (
      <span className="hidden sm:inline-flex rounded-lg border border-border px-3 py-1.5 text-xs text-slate-500">
        …
      </span>
    );
  }

  if (!session?.user) {
    return (
      <Link href="/login" className="btn-secondary !py-1.5 !text-xs">
        Account
      </Link>
    );
  }

  const label = shortLabel(session.user.name, session.user.email, session.user.address);

  return (
    <div className="relative">
      <button
        type="button"
        className="btn-secondary max-w-[9rem] truncate !py-1.5 !text-xs"
        title={session.user.accountKey || session.user.email || undefined}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
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
          <div className="absolute right-0 z-50 mt-2 w-44 rounded-xl border border-border bg-bg-card p-1.5 shadow-gold">
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
