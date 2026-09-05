import type { Metadata } from "next";
import { TokenDistributionPanel } from "@/components/TokenDistributionPanel";

export const metadata: Metadata = {
  title: "Token Distribution",
  description:
    "Your OVERLANDCOIN presale allocation — locked OLC balance, batch pricing, and unlock messaging.",
};

export default function TokenDistributionPage() {
  return (
    <div className="container-page py-10 sm:py-14">
      <span className="badge">Allocation</span>
      <h1 className="section-title mt-4">Token Distribution</h1>
      <p className="section-sub">
        Your locked presale OLC and batch context. Quest rewards are separate and claimable on the
        Claim page.
      </p>
      <div className="mt-8 max-w-4xl">
        <TokenDistributionPanel />
      </div>
    </div>
  );
}
