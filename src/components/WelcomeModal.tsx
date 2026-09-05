"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PRESALE_BATCHES } from "@/lib/site";

const STORAGE_KEY = "olc_welcome_seen";

const SLIDES = [
  {
    color: "#38c4e8",
    title: "Discover Real-World Quests",
    desc: "Thousands of overland waypoints are waiting. Browse the Quest Map, pick a trail, and get out there.",
  },
  {
    color: "#c9952a",
    title: "Visit & Earn $OLC",
    desc: "Check in with GPS + photo proof to earn OLC. Harder quests pay bigger rewards.",
  },
  {
    color: "#a855f7",
    title: "Buy in the Presale",
    desc: `Get OLC early in Batch 1 — $${PRESALE_BATCHES[0].priceUsdt.toFixed(3)} USDT terms per token. Price rises each batch.`,
  },
] as const;

export function WelcomeModal() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => setOpen(true), 1200);
    return () => window.clearTimeout(t);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* private mode */
    }
    setOpen(false);
  }

  if (!open) return null;

  const last = step >= SLIDES.length - 1;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="olc-welcome-title"
    >
      <div className="relative w-full max-w-sm rounded-3xl border border-border bg-bg-card p-6 shadow-gold sm:p-8">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 text-slate-500 transition hover:text-white"
          aria-label="Dismiss welcome"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <div className="mb-6 text-center">
          <Image
            src="/logo.png"
            alt="OLC"
            width={56}
            height={56}
            className="mx-auto mb-3 rounded-full border border-gold/40 object-cover shadow-gold"
          />
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-gold">Welcome to</p>
          <h2 id="olc-welcome-title" className="text-2xl font-black text-white">
            OverlandCoin
          </h2>
        </div>

        <div className="mb-8 space-y-3">
          {SLIDES.map((slide, i) => {
            const active = i === step;
            return (
              <button
                key={slide.title}
                type="button"
                onClick={() => setStep(i)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-border bg-bg-deep"
                    : "border-transparent opacity-50 hover:opacity-80"
                }`}
              >
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-black"
                  style={{ background: `${slide.color}22`, color: slide.color }}
                >
                  {i + 1}
                </span>
                <span>
                  <span className="block text-sm font-bold text-white">{slide.title}</span>
                  {active && (
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-400">
                      {slide.desc}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mb-6 flex justify-center gap-2">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.title}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => setStep(i)}
              className={`h-2 rounded-full transition-all ${
                i === step ? "w-6 bg-gold" : "w-2 bg-border"
              }`}
            />
          ))}
        </div>

        {!last ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(s + 1, SLIDES.length - 1))}
            className="btn-primary w-full"
          >
            Next
          </button>
        ) : (
          <div className="flex gap-3">
            <Link href="/presale" onClick={dismiss} className="btn-primary flex-1 !px-3 text-center text-sm">
              Join Presale
            </Link>
            <Link
              href="/map"
              onClick={dismiss}
              className="btn-secondary flex-1 !px-3 text-center text-sm"
            >
              Explore Map
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
