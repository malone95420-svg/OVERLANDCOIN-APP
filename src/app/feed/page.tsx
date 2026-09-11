import type { Metadata } from "next";
import { AdventureFeed } from "@/components/AdventureFeed";

export const metadata: Metadata = {
  title: "Community",
  description:
    "Shared wall of GPS + photo verified OVERLANDCOIN quest check-ins. OLC earned on check-in — claim to your wallet.",
};

export default function FeedPage() {
  return (
    <div className="page-shell w-full max-w-full overflow-x-hidden">
      <span className="badge">Community · GPS verified</span>
      <h1 className="section-title mt-4">Community</h1>
      <p className="section-sub">
        Community adventure wall — GPS + photo verified check-ins from explorers on the trail. Earn
        OLC when you check in, claim to your wallet, and share the journey.
      </p>
      <div className="mt-10 w-full max-w-full">
        <AdventureFeed />
      </div>
    </div>
  );
}
