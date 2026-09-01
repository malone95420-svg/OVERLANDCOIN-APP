import type { Metadata } from "next";
import { DEMO_LEADERBOARD } from "@/lib/leaderboard";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "Demo OVERLANDCOIN adventure leaderboard.",
};

export default function LeaderboardPage() {
  return (
    <div className="container-page py-14">
      <span className="badge">Demo data</span>
      <h1 className="section-title mt-4">Leaderboard</h1>
      <p className="section-sub">
        Fictional season standings for UI preview. Live seasons will replace this when quests go live.
      </p>

      <div className="mt-10 overflow-x-auto rounded-2xl border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-bg-panel text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Explorer</th>
              <th className="px-4 py-3">Region</th>
              <th className="px-4 py-3">Quests</th>
              <th className="px-4 py-3">OLC earned</th>
            </tr>
          </thead>
          <tbody>
            {DEMO_LEADERBOARD.map((row) => (
              <tr key={row.rank} className="border-t border-border/80 bg-bg-card/40 odd:bg-bg-card/70">
                <td className="px-4 py-3 font-bold text-gold-bright">#{row.rank}</td>
                <td className="px-4 py-3 font-medium text-white">{row.handle}</td>
                <td className="px-4 py-3 text-slate-400">{row.region}</td>
                <td className="px-4 py-3 text-slate-300">{row.questsCompleted}</td>
                <td className="px-4 py-3 font-semibold text-cyan-accent">
                  {row.olcEarned.toLocaleString()} OLC
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
