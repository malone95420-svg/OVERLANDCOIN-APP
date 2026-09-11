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
    <div className="relative h-[calc(100dvh-4rem-env(safe-area-inset-top,0px))] w-full overflow-hidden sm:h-[calc(100dvh-4.25rem-env(safe-area-inset-top,0px))]">
      <QuestCards quests={QUESTS} />
    </div>
  );
}
