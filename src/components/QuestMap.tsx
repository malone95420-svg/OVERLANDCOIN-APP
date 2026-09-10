"use client";

import dynamic from "next/dynamic";
import type { Quest } from "@/lib/quests";
import type { UserGeo } from "./UserLocationLayer";

const QuestMapInner = dynamic(() => import("./QuestMapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[320px] w-full items-center justify-center bg-[#0a121c] text-sm text-slate-500">
      Loading map…
    </div>
  ),
});

type Props = {
  quests: Quest[];
  selectedId?: string;
  /** Fly the map only on explicit request (Directions / list / Locate). */
  flyToId?: string;
  flyNonce?: number;
  onSelect?: (id: string) => void;
  onUserGeoChange?: (geo: UserGeo) => void;
  routeCoords?: [number, number][] | null;
  completedIds?: Set<string>;
  hideLocateControl?: boolean;
  locateNonce?: number;
  /** Coords captured in the locate tap (iOS needs the user-gesture getCurrentPosition). */
  locateTo?: { lat: number; lng: number } | null;
  className?: string;
};

export function QuestMap(props: Props) {
  return <QuestMapInner {...props} />;
}
