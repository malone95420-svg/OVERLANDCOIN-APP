import type { Completion, FeedPost } from "@/lib/completions";

export type LeaderboardEntry = {
  rank: number;
  handle: string;
  questsCompleted: number;
  olcEarned: number;
  region: string;
};

/** Public season standings — empty until live seasons / aggregates ship. Do not invent scores. */
export const LEADERBOARD: LeaderboardEntry[] = [];

/** @deprecated Use LEADERBOARD */
export const DEMO_LEADERBOARD = LEADERBOARD;

/**
 * Build a single local row from this browser's completions / adventure feed.
 * Honest personal progress only — not a public ranking.
 */
export function localLeaderboardFromCompletions(
  completions: Completion[],
  posts: FeedPost[] = [],
): LeaderboardEntry[] {
  if (!completions.length) return [];

  const questIds = new Set(completions.map((c) => c.questId));
  const olcEarned = completions.reduce((sum, c) => sum + (c.olcEarned || 0), 0);

  const regionCounts = new Map<string, number>();
  for (const p of posts) {
    if (p.region) regionCounts.set(p.region, (regionCounts.get(p.region) ?? 0) + 1);
  }
  let region = "Local";
  let best = 0;
  for (const [r, n] of regionCounts) {
    if (n > best) {
      best = n;
      region = r;
    }
  }

  return [
    {
      rank: 1,
      handle: "You (this device)",
      questsCompleted: questIds.size,
      olcEarned,
      region,
    },
  ];
}
