"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AccountMenu } from "@/components/AccountMenu";
import { AddOlcButton } from "@/components/AddOlcButton";
import { ConnectWallet } from "@/components/ConnectWallet";
import { PendingOlCBadge } from "@/components/PendingOlCBadge";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
import { NAV_LINKS, SITE } from "@/lib/site";

const MINI_LINKS = [
  { href: "/map", label: "Map" },
  { href: "/ranger", label: "Ranger" },
  { href: "/claim", label: "Claim" },
  { href: "/garage", label: "Garage" },
] as const;

const PRIMARY_LINKS = [
  { href: "/map", label: "Map" },
  { href: "/presale", label: "Presale" },
  { href: "/claim", label: "Claim" },
  { href: "/garage", label: "Garage" },
] as const;

export function Header() {
  const pathname = usePathname();
  const isTelegram = useTelegramWebApp();
  const [open, setOpen] = useState(false);
  const compact = isTelegram || pathname === "/tg" || pathname.startsWith("/tg/");
  const links = compact ? MINI_LINKS : NAV_LINKS;

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-bg/80 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="container-page flex h-14 min-w-0 items-center justify-between gap-1.5 sm:h-16 sm:gap-4">
        <Link href="/" className="flex min-w-0 shrink items-center gap-1.5 sm:gap-2.5">
          <Image src="/logo.png" alt="OVERLANDCOIN" width={36} height={36} className="h-8 w-8 rounded-full shrink-0 sm:h-9 sm:w-9" priority />
          <span className="truncate text-sm font-bold tracking-wide text-white sm:text-base">
            OVERLAND<span className="gold-text">COIN</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {(compact ? links : PRIMARY_LINKS).map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-2.5 py-1.5 text-sm transition ${
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

        <div className="flex min-w-0 shrink-0 items-center gap-1 sm:gap-2">
          {!compact && <PendingOlCBadge />}
          <AccountMenu compact />
          {!compact && <AddOlcButton compact showStatus={false} className="hidden lg:inline-flex" />}
          <ConnectWallet compact />
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg border border-border p-2 text-slate-200"
            aria-label="Toggle menu"
            aria-expanded={open}
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
        <div className="max-h-[min(70vh,calc(100dvh-env(safe-area-inset-top)-3.5rem))] overflow-y-auto border-t border-border bg-bg-deep pb-[env(safe-area-inset-bottom)]">
          <nav className="container-page flex flex-col gap-1 py-3">
            {links.map((link) => (
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
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-gold-bright"
            >
              Profile / Account
            </Link>
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2 text-sm text-slate-300"
            >
              Dashboard
            </Link>
            {!compact && (
              <Link
                href="/presale"
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-slate-300 sm:hidden"
              >
                Presale
              </Link>
            )}
            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              <AddOlcButton compact />
              {/* Connect stays in the top bar only — avoid duplicate chips in the drawer */}
            </div>
            <p className="px-3 pt-2 text-xs text-slate-500">{SITE.tagline}</p>
          </nav>
        </div>
      )}
    </header>
  );
}
