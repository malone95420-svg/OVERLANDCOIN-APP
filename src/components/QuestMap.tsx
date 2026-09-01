"use client";

import dynamic from "next/dynamic";
import type { Quest } from "@/lib/quests";

const QuestMapInner = dynamic(() => import("./QuestMapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[420px] items-center justify-center rounded-2xl border border-border bg-bg-panel text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

type Props = {
  quests: Quest[];
  selectedId?: string;
  onSelect?: (id: string) => void;
};

export function QuestMap(props: Props) {
  return <QuestMapInner {...props} />;
}
