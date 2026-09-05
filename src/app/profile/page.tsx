import type { Metadata } from "next";
import { ProfilePanel } from "@/components/ProfilePanel";

export const metadata: Metadata = {
  title: "Profile",
  description:
    "Your OVERLANDCOIN explorer profile — wallet, locked OLC, quest completions, and purchases.",
};

export default function ProfilePage() {
  return (
    <div className="container-page py-10 sm:py-14">
      <span className="badge">Explorer</span>
      <h1 className="section-title mt-4">Profile</h1>
      <p className="section-sub">
        Avatar, bio, connected wallet, locked / earned OLC, and your adventure ledger — Base44-style
        explorer home.
      </p>
      <div className="mt-8 max-w-3xl">
        <ProfilePanel />
      </div>
    </div>
  );
}
