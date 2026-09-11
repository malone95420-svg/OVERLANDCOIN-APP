"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState, type FormEvent } from "react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not reset password.");
        return;
      }
      setDone(true);
    } catch {
      setError("Could not reset password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page py-14">
      <span className="badge">Account</span>
      <h1 className="section-title mt-4">Choose a new password</h1>
      <p className="section-sub">This link works once and expires after one hour.</p>

      <div className="mx-auto mt-10 max-w-md">
        <div className="card space-y-4">
          {!token ? (
            <p className="text-sm text-red-300">
              This reset link is missing. Request a new one from{" "}
              <Link href="/forgot-password" className="link-accent">
                forgot password
              </Link>
              .
            </p>
          ) : done ? (
            <p className="text-sm leading-relaxed text-slate-200">
              Password updated. You can{" "}
              <Link href="/login" className="link-accent">
                sign in
              </Link>{" "}
              with your new password.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">New password (min 8)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-border bg-bg-deep px-3 py-2 text-sm text-white outline-none focus:border-gold/50"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Confirm password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-border bg-bg-deep px-3 py-2 text-sm text-white outline-none focus:border-gold/50"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && <p className="text-xs text-red-300">{error}</p>}
              <button type="submit" className="btn-secondary w-full" disabled={busy}>
                {busy ? "Saving…" : "Update password"}
              </button>
            </form>
          )}
          <p className="text-sm text-slate-400">
            <Link href="/login" className="link-accent">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="container-page py-14">
          <p className="text-sm text-slate-400">Loading…</p>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
