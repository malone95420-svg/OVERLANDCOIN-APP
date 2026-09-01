"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Quest } from "@/lib/quests";

// Fix default marker icons under bundlers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

type Props = {
  quests: Quest[];
  selectedId?: string;
  onSelect?: (id: string) => void;
};

function FlyTo({ quests, selectedId }: { quests: Quest[]; selectedId?: string }) {
  const map = useMap();
  useEffect(() => {
    const q = quests.find((x) => x.id === selectedId);
    if (q) map.flyTo([q.lat, q.lng], 5, { duration: 0.8 });
  }, [map, quests, selectedId]);
  return null;
}

export default function QuestMapInner({ quests, selectedId, onSelect }: Props) {
  return (
    <MapContainer
      center={[20, 0]}
      zoom={2}
      scrollWheelZoom={false}
      className="h-[420px] w-full rounded-2xl border border-border"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <FlyTo quests={quests} selectedId={selectedId} />
      {quests.map((q) => (
        <Marker
          key={q.id}
          position={[q.lat, q.lng]}
          eventHandlers={{
            click: () => onSelect?.(q.id),
          }}
        >
          <Popup>
            <strong>{q.title}</strong>
            <br />
            {q.region} · {q.difficulty} · Tier {q.minTier}+ · {q.rewardOlC} OLC
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
