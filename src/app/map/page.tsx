import type { Metadata } from "next";
import { QuestCards } from "@/components/QuestCards";
import { DEMO_QUESTS } from "@/lib/quests";

export const metadata: Metadata = {
  title: "Quest Map",
  description: "Demo OVERLANDCOIN quest map with outdoor adventure locations.",
};

export default function MapPage() {
  return (
    <div className="container-page py-14">
      <span className="badge">Demo quests</span>
      <h1 className="section-title mt-4">Quest Map</h1>
      <p className="section-sub">
        Explore sample outdoor waypoints. Rewards and check-ins are illustrative — proof-of-adventure tooling is coming.
      </p>
      <div className="mt-10">
        <QuestCards quests={DEMO_QUESTS} />
      </div>
      <p className="mt-6 text-xs text-slate-600">
        Map tiles © OpenStreetMap / CARTO. Quest data is demo-only and not tied to on-chain claims.
      </p>
    </div>
  );
}
