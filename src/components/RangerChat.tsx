"use client";

import { useEffect, useRef, useState } from "react";
import { useVehicle } from "@/hooks/useVehicle";
import {
  RANGER_CHIPS,
  RANGER_GREETING,
  replyRanger,
  type RangerMessage,
} from "@/lib/ranger";

type Props = {
  compact?: boolean;
  className?: string;
};

export function RangerChat({ compact = false, className = "" }: Props) {
  const { vehicle, tier, hydrated } = useVehicle();
  const [messages, setMessages] = useState<RangerMessage[]>([
    { role: "assistant", content: RANGER_GREETING },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const userMsg: RangerMessage = { role: "user", content: trimmed };
    const reply = replyRanger(trimmed, {
      vehicle: hydrated ? vehicle : null,
      tier: hydrated ? tier : null,
    });
    setMessages((prev) => [...prev, userMsg, { role: "assistant", content: reply }]);
    setInput("");
  }

  return (
    <div className={`flex flex-col rounded-2xl border border-border bg-bg-card ${className}`}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-gold to-gold-bright text-xs font-bold text-bg-deep">
          R
        </span>
        <div>
          <p className="text-sm font-semibold text-white">RANGER</p>
          <p className="text-[11px] text-slate-500">Safety-first trail assistant · local v1</p>
        </div>
      </div>

      <div
        className={`space-y-3 overflow-y-auto px-4 py-3 ${compact ? "max-h-72" : "max-h-[420px] min-h-[280px]"}`}
      >
        {messages.map((m, i) => (
          <div
            key={`${m.role}-${i}`}
            className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
              m.role === "assistant"
                ? "bg-bg-panel text-slate-300"
                : "ml-8 bg-gold/15 text-gold-bright"
            }`}
          >
            {m.content}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
        {RANGER_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => send(chip)}
            className="rounded-full border border-border bg-bg-deep px-2.5 py-1 text-[11px] text-cyan-accent hover:border-gold/40"
          >
            {chip}
          </button>
        ))}
      </div>

      <form
        className="flex gap-2 border-t border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about Moab, Iceland, your tier…"
          className="flex-1 rounded-lg border border-border bg-bg-deep px-3 py-2 text-sm text-white outline-none focus:border-gold/50"
        />
        <button type="submit" className="btn-primary !px-4 !py-2 !text-xs">
          Send
        </button>
      </form>
    </div>
  );
}
