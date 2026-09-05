import type { Metadata } from "next";
import { QuestCards } from "@/components/QuestCards";
import { QUESTS } from "@/lib/quests";

export const metadata: Metadata = {
  title: "Quest Map",
  description:
    "OVERLANDCOIN quest map — GPS check-in + photo proof. OLC rewards pending claim until the reward contract is live.",
};

export default function MapPage() {
  return (
    <div className="relative h-[calc(100dvh-4rem)] w-full overflow-hidden">
      <QuestCards quests={QUESTS} />
    </div>
  );
}
