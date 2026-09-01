import type { Metadata } from "next";
import { ROADMAP_DISCLAIMER, ROADMAP_PHASES } from "@/lib/roadmap";

export const metadata: Metadata = {
  title: "Roadmap",
  description: "OVERLANDCOIN phased roadmap with estimate disclaimer.",
};

const statusColor: Record<string, string> = {
  Done: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
  "In Progress": "text-gold-bright border-gold/40 bg-gold/10",
  Upcoming: "text-slate-300 border-border bg-bg-panel",
};

export default function RoadmapPage() {
  return (
    <div className="container-page py-14">
      <span className="badge">Phased plan</span>
      <h1 className="section-title mt-4">Roadmap</h1>
      <p className="section-sub">{ROADMAP_DISCLAIMER}</p>

      <ol className="mt-12 space-y-6">
        {ROADMAP_PHASES.map((phase, idx) => (
          <li key={phase.id} className="card relative">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/20 text-sm font-bold text-gold-bright">
                {idx + 1}
              </span>
              <h2 className="text-xl font-bold text-white">{phase.title}</h2>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${statusColor[phase.status]}`}>
                {phase.status}
              </span>
              <span className="text-xs text-slate-500">{phase.timing}</span>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              {phase.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-cyan-accent">▹</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
