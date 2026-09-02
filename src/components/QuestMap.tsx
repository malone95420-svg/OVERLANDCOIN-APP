"use client";

import dynamic from "next/dynamic";
import type { Quest } from "@/lib/quests";
import type { UserGeo } from "./UserLocationLayer";

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
  /** Fly the map only when Find quest is tapped — not on every selection. */
  flyToId?: string;
  onSelect?: (id: string) => void;
  onUserGeoChange?: (geo: UserGeo) => void;
  routeCoords?: [number, number][] | null;
};

export function QuestMap(props: Props) {
  return <QuestMapInner {...props} />;
}
