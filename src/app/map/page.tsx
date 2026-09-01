import type { Metadata } from "next";
import { QuestCards } from "@/components/QuestCards";
import { QUEST_COUNT, QUESTS } from "@/lib/quests";

export const metadata: Metadata = {
  title: "Quest Map",
  description:
    "OVERLANDCOIN quest map — GPS check-in + photo proof. OLC rewards pending claim until the reward contract is live.",
};

export default function MapPage() {
  return (
    <div className="container-page py-14">
      <span className="badge">{QUEST_COUNT} seeded quests</span>
      <h1 className="section-title mt-4">Quest Map</h1>
      <p className="section-sub">
        Explore overland waypoints worldwide. Check in only when your GPS is inside the quest radius
        and you attach a photo. OLC is recorded as pending claim — on-chain payout comes later when a
        reward contract exists.
      </p>
      <div className="mt-10">
        <QuestCards quests={QUESTS} />
      </div>
      <p className="mt-6 text-xs text-slate-600">
        Map tiles © OpenStreetMap / CARTO. Quest coords are real trailheads/parks for illustration.
        Badge: GPS verified · Photo proof · OLC pending claim.
      </p>
    </div>
  );
}
