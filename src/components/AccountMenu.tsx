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
    <div className="flex items-center gap-1.5">
      <Link
        href="/garage"
        className="btn-secondary !py-1.5 !text-xs max-w-[9rem] truncate"
        title={session.user.accountKey || session.user.email || undefined}
      >
        {label}
      </Link>
      <button
        type="button"
        className="hidden sm:inline-flex rounded-lg border border-border px-2 py-1.5 text-[11px] text-slate-400 hover:text-white"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          void signOut({ callbackUrl: "/" }).finally(() => setBusy(false));
        }}
      >
        {busy ? "…" : "Sign out"}
      </button>
    </div>
  );
}
