"use client";

import { useState } from "react";
import { TOKEN } from "@/lib/token";

type Props = {
  address?: string;
  className?: string;
  showFull?: boolean;
};

export function CopyAddress({
  address = TOKEN.contractAddress,
  className = "",
  showFull = true,
}: Props) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const display = showFull
    ? address
    : `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <button
      type="button"
      onClick={onCopy}
      className={`group inline-flex max-w-full items-center gap-2 rounded-xl border border-border bg-bg-panel px-3 py-2 font-mono text-xs text-slate-200 transition hover:border-gold/40 sm:text-sm ${className}`}
      aria-label="Copy contract address"
    >
      <span className="truncate">{display}</span>
      <span className="shrink-0 rounded-md bg-bg-card px-2 py-0.5 text-[10px] font-sans font-semibold uppercase tracking-wide text-gold-bright">
        {copied ? "Copied" : "Copy"}
      </span>
    </button>
  );
}
