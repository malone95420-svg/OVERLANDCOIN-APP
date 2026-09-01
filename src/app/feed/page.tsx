import type { Metadata } from "next";
import { AdventureFeed } from "@/components/AdventureFeed";

export const metadata: Metadata = {
  title: "Adventure Feed",
  description:
    "GPS-verified quest photos from OVERLANDCOIN check-ins. OLC rewards are pending claim until the reward contract is live.",
};

export default function FeedPage() {
  return (
    <div className="container-page py-14">
      <span className="badge">GPS verified · Photo proof</span>
      <h1 className="section-title mt-4">Adventure Feed</h1>
      <p className="section-sub">
        Public-feeling wall of check-in photos from this browser. Rewards are GPS + photo verified
        and recorded as <span className="font-mono text-cyan-accent">pending_claim</span> — on-chain
        claim comes later when a reward contract exists. No tokens move on BlockDAG today.
      </p>
      <div className="mt-10">
        <AdventureFeed />
      </div>
    </div>
  );
}
