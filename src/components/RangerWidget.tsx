"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
import { RangerChat } from "./RangerChat";

export function RangerWidget() {
  const pathname = usePathname();
  const isTelegram = useTelegramWebApp();
  const [open, setOpen] = useState(false);
  const onMiniMap = pathname === "/map" && !isTelegram;
  if (onMiniMap) return null;
  if (pathname === "/tg" || pathname.startsWith("/tg/")) return null;
  // Keep forms / checkout CTAs clear on auth + buy flows
  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/presale"
  )
    return null;

  return (
    <div
      className="pointer-events-none fixed z-40 flex flex-col items-end gap-3"
      style={{
        right: "max(1rem, env(safe-area-inset-right, 0px))",
        bottom: "max(1rem, env(safe-area-inset-bottom, 0px))",
      }}
    >
      {open && (
        <div className="pointer-events-auto w-[min(100vw-2rem,380px)] shadow-gold">
          <RangerChat compact />
          <div className="rounded-b-2xl border border-t-0 border-border bg-bg-deep px-3 py-2 text-center">
            <Link href="/ranger" className="text-xs text-cyan-accent hover:text-gold-bright">
              Open full RANGER page →
            </Link>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto btn-primary shadow-gold !rounded-full !px-5 !py-3"
        aria-expanded={open}
        aria-label="Ask RANGER"
      >
        {open ? "Close" : "Ask RANGER"}
      </button>
    </div>
  );
}
