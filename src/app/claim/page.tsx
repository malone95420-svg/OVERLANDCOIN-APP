import type { Metadata } from "next";
import { ClaimHub } from "@/components/ClaimHub";

export const metadata: Metadata = {
  title: "Claim OLC",
  description:
    "Claim pending OVERLANDCOIN quest rewards and retry pending presale wallet deliveries.",
};

export default function ClaimPage() {
  return (
    <div className="container-page py-10 sm:py-14">
      <span className="badge">Rewards</span>
      <h1 className="section-title mt-4">Claim OLC</h1>
      <p className="section-sub">
        Quest rewards claim straight to your wallet. Presale buys deliver OLC ERC-20 after payment
        verifies — use Retry deliver if a transfer is still pending.
      </p>
      <div className="mt-8 max-w-4xl">
        <ClaimHub />
      </div>
    </div>
  );
}
