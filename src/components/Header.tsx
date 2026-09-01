"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ConnectWallet } from "@/components/ConnectWallet";
import { PendingOlCBadge } from "@/components/PendingOlCBadge";
import { NAV_LINKS, SITE } from "@/lib/site";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-bg/80 backdrop-blur-xl">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <Image src="/logo.png" alt="OVERLANDCOIN" width={36} height={36} className="rounded-full" priority />
          <span className="font-bold tracking-wide text-white">
            OVERLAND<span className="gold-text">COIN</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  active
                    ? "bg-bg-card text-gold-bright"
                    : "text-slate-300 hover:bg-bg-panel hover:text-white"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <PendingOlCBadge />
          <Link href="/presale" className="btn-secondary hidden sm:inline-flex !py-2 !text-xs">
            Presale
          </Link>
          <ConnectWallet compact />
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-slate-200 lg:hidden"
            aria-label="Toggle menu"
            onClick={() => setOpen((v) => !v)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? (
                <path d="M6 6l12 12M18 6L6 18" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-border bg-bg-deep lg:hidden">
          <nav className="container-page flex flex-col gap-1 py-3">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-lg px-3 py-2 text-sm ${
                  pathname === link.href ? "bg-bg-card text-gold-bright" : "text-slate-300"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="px-3 py-2">
              <ConnectWallet />
            </div>
            <p className="px-3 pt-2 text-xs text-slate-500">{SITE.tagline}</p>
          </nav>
        </div>
      )}
    </header>
  );
}
