import type { Metadata } from "next";
import { LeaderboardBoard } from "@/components/LeaderboardBoard";

export const metadata: Metadata = {
  title: "Leaderboard",
  description: "OVERLANDCOIN adventure leaderboard — complete quests to climb the board.",
};

export default function LeaderboardPage() {
  return (
    <div className="container-page py-14">
      <span className="badge">Season standings</span>
      <h1 className="section-title mt-4">Leaderboard</h1>
      <p className="section-sub">
        Rankings from verified quest completions. No rankings yet — complete quests to climb the
        board when the season is live.
      </p>
      <LeaderboardBoard />
    </div>
  );
}
