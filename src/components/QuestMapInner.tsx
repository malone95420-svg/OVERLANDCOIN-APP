"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
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
  onUserGeoChange?: (geo: UserGeo) => void;
  /** Leaflet [lat, lng] pairs for the active directions route. */
  routeCoords?: [number, number][] | null;
};

function FlyTo({ quests, selectedId }: { quests: Quest[]; selectedId?: string }) {
  const map = useMap();
  useEffect(() => {
    const q = quests.find((x) => x.id === selectedId);
    if (q) {
      map.flyTo([q.lat, q.lng], 13, { duration: 0.8 });
    }
  }, [map, quests, selectedId]);
  return null;
}

function FitRoute({ coords }: { coords: [number, number][] | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!coords || coords.length < 2) return;
    const bounds = L.latLngBounds(coords.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14, animate: true });
  }, [map, coords]);
  return null;
}

export default function QuestMapInner({
  quests,
  selectedId,
  onSelect,
  onUserGeoChange,
  routeCoords,
}: Props) {
  const [basemapId, setBasemapId] = useState<BasemapId>("street");
  const [hydratedBasemap, setHydratedBasemap] = useState(false);
  const [userGeo, setUserGeo] = useState<UserGeo>({ status: "idle" });
  const mapRef = useRef<L.Map | null>(null);
  const onUserGeoChangeRef = useRef(onUserGeoChange);
  onUserGeoChangeRef.current = onUserGeoChange;

  useEffect(() => {
    setBasemapId(loadBasemapId());
    setHydratedBasemap(true);
  }, []);

  function onBasemapChange(id: BasemapId) {
    setBasemapId(id);
    saveBasemapId(id);
  }

  function handleGeoChange(geo: UserGeo) {
    setUserGeo(geo);
    onUserGeoChangeRef.current?.(geo);
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
        <FitRoute coords={routeCoords} />
        <UserLocationLayer onGeoChange={handleGeoChange} />
        {routeCoords && routeCoords.length >= 2 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{
              color: "#22d3ee",
              weight: 4,
              opacity: 0.85,
              lineJoin: "round",
              lineCap: "round",
            }}
          />
        )}
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
