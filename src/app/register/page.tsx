"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState, type FormEvent } from "react";
import { WalletSignInButton } from "@/components/WalletSignInButton";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailOk, setEmailOk] = useState<boolean | null>(null);
  const [emailHint, setEmailHint] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/auth/register")
      .then((r) => r.json())
      .then((d: { emailAuth?: boolean; reason?: string | null }) => {
        setEmailOk(Boolean(d.emailAuth));
        setEmailHint(d.reason ?? null);
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
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name: name || undefined }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not create profile.");
        return;
      }
      const login = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/garage",
      });
      if (login?.error) {
        setError("Profile created — please sign in.");
        window.location.href = "/login";
        return;
      }
      window.location.href = login?.url || "/garage";
    } catch {
      setError("Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container-page py-14">
      <span className="badge">Account</span>
      <h1 className="section-title mt-4">Create profile</h1>
      <p className="section-sub">
        Prefer wallet sign-in for a no-setup account. Email profiles need Upstash Redis in production.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Wallet (recommended)</h2>
          <WalletSignInButton />
        </div>

        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Email profile</h2>
          {emailOk === false && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              {emailHint ||
                "Email auth needs Upstash — use wallet login."}
            </p>
          )}
          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-slate-400">Display name (optional)</label>
              <input
                type="text"
                className="w-full rounded-lg border border-border bg-bg-deep px-3 py-2 text-sm text-white outline-none focus:border-gold/50"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
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
              <label className="mb-1 block text-xs text-slate-400">Password (min 8)</label>
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
            {error && <p className="text-xs text-red-300">{error}</p>}
            <button type="submit" className="btn-secondary w-full" disabled={busy || emailOk === false}>
              {busy ? "Creating…" : "Create profile"}
            </button>
          </form>
          <p className="text-sm text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="link-accent">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
