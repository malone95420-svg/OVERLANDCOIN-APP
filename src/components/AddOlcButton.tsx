"use client";

import { useCallback, useState } from "react";
import { addOlcToWallet } from "@/lib/addOlcToken";

type Props = {
  className?: string;
  /** Compact header style */
  compact?: boolean;
  /** Show status text below the button */
  showStatus?: boolean;
};

export function AddOlcButton({ className = "", compact = false, showStatus = true }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const onClick = useCallback(async () => {
    setStatus("loading");
    setMessage(null);
    const res = await addOlcToWallet();
    if (res.ok) {
      setStatus("success");
      setMessage("OLC added to your wallet.");
    } else {
      setStatus("error");
      setMessage(res.error);
    }
  }, []);

  const btnClass = compact
    ? `btn-secondary !py-1.5 !text-xs ${className}`
    : `btn-primary !py-2 !text-xs ${className}`;

  const label =
    status === "loading" ? "Adding…" : status === "success" ? "OLC added" : "Add OLC";

  return (
    <div className="relative inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={status === "loading"}
        className={btnClass}
        title="Import OLC into MetaMask / your wallet on BlockDAG"
      >
        {label}
      </button>
      {showStatus && message && (
        <p
          className={`max-w-[16rem] text-[11px] leading-snug ${
            status === "error" ? "text-red-300" : "text-emerald-400"
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
