"use client";

import { useEffect, useState } from "react";
import {
  LEADERBOARD,
  localLeaderboardFromCompletions,
  type LeaderboardEntry,
} from "@/lib/leaderboard";
import { loadCompletions, loadPosts } from "@/lib/completions";

export function LeaderboardBoard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>(LEADERBOARD);
  const [localOnly, setLocalOnly] = useState(false);

  useEffect(() => {
    if (LEADERBOARD.length > 0) {
      setEntries(LEADERBOARD);
      setLocalOnly(false);
      return;
    }
    const local = localLeaderboardFromCompletions(loadCompletions(), loadPosts());
    if (local.length > 0) {
      setEntries(local);
      setLocalOnly(true);
    } else {
      setEntries([]);
      setLocalOnly(false);
    }
  }, []);

  if (entries.length === 0) {
    return (
      <div className="mt-10 rounded-2xl border border-border bg-bg-card/50 px-6 py-14 text-center">
        <p className="text-lg font-semibold text-white">No rankings yet</p>
        <p className="mt-2 text-sm text-slate-400">
          Complete quests to climb the board. Season standings will appear here when live.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10">
      {localOnly && (
        <p className="mb-3 text-xs text-slate-500">
          Showing your local progress on this device. Public season rankings are not live yet.
        </p>
      )}
      <div className="overflow-x-auto rounded-2xl border border-border">
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
            {entries.map((row) => (
              <tr key={`${row.rank}-${row.handle}`} className="border-t border-border/80 bg-bg-card/40 odd:bg-bg-card/70">
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
