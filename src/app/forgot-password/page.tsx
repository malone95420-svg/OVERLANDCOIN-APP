"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not send reset email.");
        return;
      }
      setDone(true);
    } catch {
      setError("Could not send reset email.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page py-14">
      <span className="badge">Account</span>
      <h1 className="section-title mt-4">Forgot password</h1>
      <p className="section-sub">
        Enter the email you used to sign up. If a profile exists, we&apos;ll send a one-hour
        reset link. Wallet logins don&apos;t use a password.
      </p>

      <div className="mx-auto mt-10 max-w-md">
        <div className="card space-y-4">
          {done ? (
            <p className="text-sm leading-relaxed text-slate-200">
              If an account exists for that email, we sent a reset link. Check your inbox and
              spam folder. The link expires in one hour.
            </p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Email</label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  className="w-full rounded-lg border border-border bg-bg-deep px-3 py-2 text-sm text-white outline-none focus:border-gold/50"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && <p className="text-xs text-red-300">{error}</p>}
              <button type="submit" className="btn-secondary w-full" disabled={busy}>
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )}
          <p className="text-sm text-slate-400">
            Remembered it?{" "}
            <Link href="/login" className="link-accent">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
