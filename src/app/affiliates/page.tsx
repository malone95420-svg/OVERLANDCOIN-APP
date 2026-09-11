import type { Metadata } from "next";
import { AffiliatesPanel } from "@/components/AffiliatesPanel";

export const metadata: Metadata = {
  title: "Affiliates",
  description:
    "OVERLANDCOIN affiliate dashboard — referral link, stats, and how affiliate rewards work.",
};

export default function AffiliatesPage() {
  return (
    <div className="page-shell">
      <span className="badge">Grow the trail</span>
      <h1 className="section-title mt-4">Affiliates</h1>
      <p className="section-sub">
        Share your link. Referral stats stay honest (zero) until the affiliate backend is live —
        your code is already tied to your account.
      </p>
      <div className="mt-8 max-w-3xl">
        <AffiliatesPanel />
      </div>
    </div>
  );
}
