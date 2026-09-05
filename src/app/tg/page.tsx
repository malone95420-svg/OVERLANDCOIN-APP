import type { Metadata } from "next";
import Link from "next/link";
import { QuestCards } from "@/components/QuestCards";
import { RangerChat } from "@/components/RangerChat";
import { QUESTS } from "@/lib/quests";

export const metadata: Metadata = {
  title: "OVERLANDCOIN Mini App",
  description:
    "Telegram Mini App — Quest Map, RANGER, and live-app check-in / claim. Completions use the same GPS + photo ledger.",
};

export default function TelegramMiniAppPage() {
  return (
    <div className="flex min-h-[calc(100dvh-4rem)] flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-bg-deep/90 px-3 py-2 text-xs">
        <span className="font-semibold text-gold-bright">Mini App</span>
        <Link href="/map" className="rounded-lg bg-bg-card px-2 py-1 text-slate-200">
          Quest Map
        </Link>
        <Link href="/ranger" className="rounded-lg px-2 py-1 text-slate-300 hover:text-white">
          Ranger
        </Link>
        <Link href="/claim" className="rounded-lg px-2 py-1 text-slate-300 hover:text-white">
          Claim
        </Link>
        <Link href="/garage" className="rounded-lg px-2 py-1 text-slate-300 hover:text-white">
          Garage
        </Link>
        <span className="text-slate-500">
          Check-in stays on the live map — same completions + /api/rewards/claim.
        </span>
      </div>
      <div className="relative min-h-[55vh] flex-1 overflow-hidden">
        <QuestCards quests={QUESTS} />
      </div>
      <div className="border-t border-border bg-bg-deep px-3 py-3">
        <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">RANGER</p>
        <RangerChat compact />
      </div>
    </div>
  );
}
