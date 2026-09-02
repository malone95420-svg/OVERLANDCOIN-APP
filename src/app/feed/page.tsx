import type { Metadata } from "next";
import { AdventureFeed } from "@/components/AdventureFeed";

export const metadata: Metadata = {
  title: "Adventure Feed",
  description:
    "Shared wall of GPS + photo verified OVERLANDCOIN quest check-ins. OLC earned on check-in — claim to your wallet.",
};

export default function FeedPage() {
  return (
    <div className="container-page w-full max-w-full overflow-x-hidden py-14">
      <span className="badge">GPS verified · Photo proof</span>
      <h1 className="section-title mt-4">Adventure Feed</h1>
      <p className="section-sub">
        Public adventure wall of GPS + photo verified quest check-ins. Earn OLC when you check in,
        then claim rewards to your wallet. Share the trail with the community.
      </p>
      <div className="mt-10 w-full max-w-full">
        <AdventureFeed />
      </div>
    </div>
  );
}
