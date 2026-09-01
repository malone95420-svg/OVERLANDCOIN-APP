export type LeaderboardEntry = {
  rank: number;
  handle: string;
  questsCompleted: number;
  olcEarned: number;
  region: string;
};

/** Demo leaderboard — fictional handles for UI preview only. */
export const DEMO_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, handle: "TrailBoss_4x4", questsCompleted: 42, olcEarned: 12850, region: "Utah" },
  { rank: 2, handle: "DesertNomad", questsCompleted: 38, olcEarned: 11200, region: "Nevada" },
  { rank: 3, handle: "AlpineRover", questsCompleted: 35, olcEarned: 10450, region: "Colorado" },
  { rank: 4, handle: "FjordFinder", questsCompleted: 31, olcEarned: 9100, region: "Norway" },
  { rank: 5, handle: "RedDirtRex", questsCompleted: 29, olcEarned: 8750, region: "Australia" },
  { rank: 6, handle: "MapOrDie", questsCompleted: 27, olcEarned: 8200, region: "Arizona" },
  { rank: 7, handle: "CampfireCrypto", questsCompleted: 24, olcEarned: 7100, region: "Montana" },
  { rank: 8, handle: "OverlandOz", questsCompleted: 22, olcEarned: 6800, region: "Australia" },
  { rank: 9, handle: "PunaPilot", questsCompleted: 20, olcEarned: 6400, region: "Chile" },
  { rank: 10, handle: "WaypointWillow", questsCompleted: 18, olcEarned: 5900, region: "Canada" },
];
