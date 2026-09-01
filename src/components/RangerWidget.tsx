"use client";

import { useState } from "react";
import Link from "next/link";
import { RangerChat } from "./RangerChat";

export function RangerWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-3">
      {open && (
        <div className="w-[min(100vw-2rem,380px)] shadow-gold">
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
        className="btn-primary shadow-gold !rounded-full !px-5 !py-3"
        aria-expanded={open}
        aria-label="Ask RANGER"
      >
        {open ? "Close" : "Ask RANGER"}
      </button>
    </div>
  );
}
