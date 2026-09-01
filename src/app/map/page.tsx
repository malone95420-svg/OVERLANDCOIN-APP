import type { Metadata } from "next";
import { QuestCards } from "@/components/QuestCards";
import { QUEST_COUNT, QUESTS } from "@/lib/quests";

export const metadata: Metadata = {
  title: "Quest Map",
  description: "OVERLANDCOIN quest map — filter outdoor waypoints by your vehicle capability tier.",
};

export default function MapPage() {
  return (
    <div className="container-page py-14">
      <span className="badge">{QUEST_COUNT} seeded quests</span>
      <h1 className="section-title mt-4">Quest Map</h1>
      <p className="section-sub">
        Explore overland waypoints worldwide. Pins filter to routes your Garage vehicle can reach —
        toggle “Show all” to browse every difficulty including Legendary.
      </p>
      <div className="mt-10">
        <QuestCards quests={QUESTS} />
      </div>
      <p className="mt-6 text-xs text-slate-600">
        Map tiles © OpenStreetMap / CARTO. Quest coords are real trailheads/parks for illustration;
        rewards are not live on-chain claims yet.
      </p>
    </div>
  );
}
