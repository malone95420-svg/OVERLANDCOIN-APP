"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState, type FormEvent } from "react";
import { WalletSignInButton } from "@/components/WalletSignInButton";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailOk, setEmailOk] = useState<boolean | null>(null);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [googleOk, setGoogleOk] = useState(false);

  useEffect(() => {
    void fetch("/api/auth/register")
      .then((r) => r.json())
      .then((d: { emailAuth?: boolean; reason?: string | null; google?: boolean }) => {
        setEmailOk(Boolean(d.emailAuth));
        setEmailHint(d.reason ?? null);
        setGoogleOk(Boolean(d.google));
      })
      .catch(() => {
        setEmailOk(false);
        setEmailHint("Could not check email auth status.");
      });
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/garage",
      });
      if (res?.error) {
        setError("Invalid email or password.");
        return;
      }
      window.location.href = res?.url || "/garage";
    } catch {
      setError("Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page py-14">
      <span className="badge">Account</span>
      <h1 className="section-title mt-4">Sign in</h1>
      <p className="section-sub">
        Wallet login works now. Email/password needs AUTH_SECRET and Upstash Redis in production.
        Progress stays on this device under your account key until cross-device sync ships.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Wallet (recommended)</h2>
          <WalletSignInButton />
        </div>

        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Email</h2>
          {emailOk === false && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              {emailHint ||
                "Email auth needs Upstash — use wallet login."}
            </p>
          )}
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
            <div>
              <label className="mb-1 block text-xs text-slate-400">Password</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                className="w-full rounded-lg border border-border bg-bg-deep px-3 py-2 text-sm text-white outline-none focus:border-gold/50"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-xs text-red-300">{error}</p>}
            <button type="submit" className="btn-secondary w-full" disabled={busy || emailOk === false}>
              {busy ? "Signing in…" : "Sign in with email"}
            </button>
          </form>
          {googleOk && (
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => void signIn("google", { callbackUrl: "/garage" })}
            >
              Continue with Google
            </button>
          )}
          <p className="text-sm text-slate-400">
            New here?{" "}
            <Link href="/register" className="link-accent">
              Create profile
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
