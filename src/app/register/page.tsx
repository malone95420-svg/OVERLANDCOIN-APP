"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState, type FormEvent } from "react";
import { WalletSignInButton } from "@/components/WalletSignInButton";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"form" | "code">("form");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailOk, setEmailOk] = useState<boolean | null>(null);
  const [emailHint, setEmailHint] = useState<string | null>(null);
  const [mailOk, setMailOk] = useState<boolean | null>(null);

  useEffect(() => {
    void fetch("/api/auth/register")
      .then((r) => r.json())
      .then((d: { emailAuth?: boolean; reason?: string | null; mailConfigured?: boolean }) => {
        setEmailOk(Boolean(d.emailAuth));
        setEmailHint(d.reason ?? null);
        setMailOk(d.mailConfigured !== false);
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
      const data = (await res.json()) as { error?: string; needsVerification?: boolean };
      if (!res.ok) {
        setError(data.error || "Could not create profile.");
        return;
      }
      setStep("code");
    } catch {
      setError("Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not verify email.");
        return;
      }
      const login = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: "/dashboard",
      });
      if (login?.error) {
        window.location.href = "/login";
        return;
      }
      window.location.href = login?.url || "/dashboard";
    } catch {
      setError("Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, resend: true }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Could not resend code.");
        return;
      }
      setCode("");
    } catch {
      setError("Could not resend code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-shell">
      <span className="badge">Account</span>
      <h1 className="section-title mt-4">Create your OVERLANDCOIN profile</h1>
      <p className="section-sub">
        Sign up with email. We send a 6-digit code to verify it, then a welcome note with the
        Quest Map, presale, and dashboard. Wallet sign-in skips email.
      </p>

      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">
            {step === "code" ? "Check your email" : "Email"}
          </h2>
          {emailOk === false && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              {emailHint ||
                "Email signup is temporarily unavailable. Use wallet sign-in, or try again shortly."}
            </p>
          )}
          {emailOk && mailOk === false && (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              Email verification needs mail configured on the server. Use wallet sign-in for now.
            </p>
          )}

          {step === "code" ? (
            <form onSubmit={onVerify} className="space-y-3">
              <p className="text-sm text-slate-400">
                We sent a 6-digit code to{" "}
                <span className="text-slate-200">{email}</span>. It expires in 15 minutes.
              </p>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  pattern="[0-9]{6}"
                  maxLength={6}
                  className="w-full rounded-lg border border-border bg-bg-deep px-3 py-2 text-center font-mono text-lg tracking-[0.4em] text-white outline-none focus:border-gold/50"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
              {error && <p className="text-xs text-red-300">{error}</p>}
              <button type="submit" className="btn-secondary w-full" disabled={busy || code.length !== 6}>
                {busy ? "Verifying…" : "Verify email"}
              </button>
              <button
                type="button"
                className="w-full text-sm text-slate-400 hover:text-gold-bright"
                disabled={busy}
                onClick={() => void onResend()}
              >
                Resend code
              </button>
              <button
                type="button"
                className="w-full text-sm text-slate-500 hover:text-slate-300"
                disabled={busy}
                onClick={() => {
                  setStep("form");
                  setCode("");
                  setError(null);
                }}
              >
                Use a different email
              </button>
            </form>
          ) : (
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
              <button
                type="submit"
                className="btn-secondary w-full"
                disabled={busy || emailOk === false || mailOk === false}
              >
                {busy ? "Sending code…" : "Send verification code"}
              </button>
            </form>
          )}
          <p className="text-sm text-slate-400">
            Already have an account?{" "}
            <Link href="/login" className="link-accent">
              Sign in
            </Link>
          </p>
        </div>

        <div className="card space-y-4">
          <h2 className="text-lg font-semibold text-white">Wallet</h2>
          <p className="text-sm text-slate-400">
            No password — sign a message to create or open a wallet profile.
          </p>
          <WalletSignInButton />
        </div>
      </div>
    </div>
  );
}
