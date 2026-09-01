"use client";

import { useState } from "react";
import type { Quest } from "@/lib/quests";
import { QuestMap } from "./QuestMap";

export function QuestCards({ quests }: { quests: Quest[] }) {
  const [selected, setSelected] = useState<string | undefined>(quests[0]?.id);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="lg:col-span-3">
        <QuestMap quests={quests} selectedId={selected} onSelect={setSelected} />
      </div>
      <div className="flex max-h-[420px] flex-col gap-3 overflow-y-auto lg:col-span-2">
        {quests.map((q) => {
          const active = q.id === selected;
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => setSelected(q.id)}
              className={`rounded-xl border p-4 text-left transition ${
                active
                  ? "border-gold/60 bg-bg-card shadow-gold"
                  : "border-border bg-bg-panel hover:border-gold/30"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold text-white">{q.title}</h3>
                <span className="badge !text-[10px]">{q.difficulty}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{q.region}</p>
              <p className="mt-2 text-sm text-slate-400">{q.description}</p>
              <p className="mt-3 text-sm font-semibold text-gold-bright">{q.rewardOlC} OLC reward</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
