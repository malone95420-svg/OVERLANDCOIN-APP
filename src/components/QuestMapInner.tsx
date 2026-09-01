"use client";

import { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Quest } from "@/lib/quests";
import {
  BASEMAPS,
  loadBasemapId,
  saveBasemapId,
  type BasemapId,
} from "@/lib/mapBasemaps";
import { MapBasemapControl } from "./MapBasemapControl";
import {
  LocateMeControl,
  LocationPermissionBanner,
  MapApiBridge,
  UserLocationLayer,
  type UserGeo,
} from "./UserLocationLayer";

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
  const [basemapId, setBasemapId] = useState<BasemapId>("street");
  const [hydratedBasemap, setHydratedBasemap] = useState(false);
  const [userGeo, setUserGeo] = useState<UserGeo>({ status: "idle" });
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    setBasemapId(loadBasemapId());
    setHydratedBasemap(true);
  }, []);

  function onBasemapChange(id: BasemapId) {
    setBasemapId(id);
    saveBasemapId(id);
  }

  const basemap = BASEMAPS[basemapId];

  return (
    <div className="relative">
      <MapBasemapControl value={basemapId} onChange={onBasemapChange} />
      <LocationPermissionBanner geo={userGeo} />
      <LocateMeControl geo={userGeo} mapRef={mapRef} />
      <MapContainer
        center={[20, 0]}
        zoom={2}
        scrollWheelZoom={false}
        className="h-[420px] w-full rounded-2xl border border-border"
      >
        <TileLayer
          key={hydratedBasemap ? basemap.id : "street"}
          attribution={basemap.attribution}
          url={basemap.url}
          maxZoom={basemap.maxZoom ?? 19}
          {...(basemap.subdomains ? { subdomains: basemap.subdomains } : {})}
        />
        <MapApiBridge mapRef={mapRef} />
        <FlyTo quests={quests} selectedId={selectedId} />
        <UserLocationLayer onGeoChange={setUserGeo} />
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
              {q.region} · {q.difficulty} · Tier {q.minTier}+ · {q.radiusMeters}m · {q.rewardOlC}{" "}
              OLC
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
