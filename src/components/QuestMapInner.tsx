"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Quest } from "@/lib/quests";
import { hasCompletedQuest } from "@/lib/completions";
import { DIFFICULTY_COLORS } from "@/lib/questDifficultyUi";
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
  /** Explicit fly target from Directions — do not fly on selectedId alone. */
  flyToId?: string;
  onSelect?: (id: string) => void;
  onUserGeoChange?: (geo: UserGeo) => void;
  /** Leaflet [lat, lng] pairs for the active directions route. */
  routeCoords?: [number, number][] | null;
  /** Completed quest ids for marker badges. */
  completedIds?: Set<string>;
  /** Hide floating locate control (parent detail card has Enable location). */
  hideLocateControl?: boolean;
  /** Increment to fly map to the current GPS position. */
  locateNonce?: number;
  className?: string;
};

function questMarkerIcon(
  q: Quest,
  selected: boolean,
  completed: boolean,
): L.DivIcon {
  const color = DIFFICULTY_COLORS[q.difficulty] ?? "#94a3b8";
  const size = selected ? 22 : 14;
  const ring = selected
    ? `box-shadow:0 0 0 3px rgba(255,255,255,0.95),0 0 0 6px ${color};`
    : `box-shadow:0 1px 4px rgba(0,0,0,0.45);`;
  const check = completed
    ? `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:${selected ? 11 : 8}px;color:#fff;font-weight:800;line-height:1;">✓</span>`
    : "";
  return L.divIcon({
    className: "olc-quest-marker",
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid #fff;${ring}position:relative;opacity:${completed && !selected ? 0.72 : 1};">${check}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function FlyTo({ quests, flyToId }: { quests: Quest[]; flyToId?: string }) {
  const map = useMap();
  useEffect(() => {
    if (!flyToId) return;
    const q = quests.find((x) => x.id === flyToId);
    if (q) {
      map.flyTo([q.lat, q.lng], 13, { duration: 0.8 });
    }
  }, [map, quests, flyToId]);
  return null;
}


function FlyToUser({ geo, locateNonce }: { geo: UserGeo; locateNonce?: number }) {
  const map = useMap();
  useEffect(() => {
    if (!locateNonce) return;
    if (geo.status !== "watching") return;
    map.flyTo([geo.lat, geo.lng], Math.max(map.getZoom(), 14), { duration: 0.85 });
  }, [locateNonce, geo, map]);
  return null;
}

function FitRoute({ coords }: { coords: [number, number][] | null | undefined }) {
  const map = useMap();
  useEffect(() => {
    if (!coords || coords.length < 2) return;
    const bounds = L.latLngBounds(coords.map(([lat, lng]) => L.latLng(lat, lng)));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14, animate: true });
  }, [map, coords]);
  return null;
}

function hashId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Viewport + zoom thinning so 1500+ pins stay usable. */
function VisibleQuestMarkers({
  quests,
  selectedId,
  completedIds,
  onSelect,
}: {
  quests: Quest[];
  selectedId?: string;
  completedIds?: Set<string>;
  onSelect?: (id: string) => void;
}) {
  const map = useMap();
  const [version, setVersion] = useState(0);

  useMapEvents({
    moveend: () => setVersion((v) => v + 1),
    zoomend: () => setVersion((v) => v + 1),
  });

  const visible = useMemo(() => {
    void version;
    const bounds = map.getBounds().pad(0.15);
    const zoom = map.getZoom();
    const out: Quest[] = [];
    for (const q of quests) {
      if (selectedId && q.id === selectedId) {
        out.push(q);
        continue;
      }
      if (!bounds.contains([q.lat, q.lng])) continue;
      // Thin at low zoom to avoid DOM lag
      if (zoom < 3) {
        if (q.difficulty !== "Legendary" && hashId(q.id) % 12 !== 0) continue;
      } else if (zoom < 5) {
        if (hashId(q.id) % 4 !== 0 && q.difficulty !== "Legendary") continue;
      } else if (zoom < 7) {
        if (hashId(q.id) % 2 !== 0 && q.difficulty === "Moderate") continue;
      }
      out.push(q);
    }
    // Cap absolute DOM markers
    if (out.length > 450) {
      const selected = selectedId ? out.filter((q) => q.id === selectedId) : [];
      const rest = out.filter((q) => q.id !== selectedId).slice(0, 449);
      return [...selected, ...rest];
    }
    return out;
  }, [quests, selectedId, map, version]);

  const iconCache = useRef(new Map<string, L.DivIcon>());

  return (
    <>
      {visible.map((q) => {
        const selected = q.id === selectedId;
        const completed =
          completedIds?.has(q.id) || hasCompletedQuest(q.id);
        const key = `${q.id}:${selected ? 1 : 0}:${completed ? 1 : 0}`;
        let icon = iconCache.current.get(key);
        if (!icon) {
          icon = questMarkerIcon(q, selected, completed);
          iconCache.current.set(key, icon);
        }
        return (
          <Marker
            key={q.id}
            position={[q.lat, q.lng]}
            icon={icon}
            eventHandlers={{
              click: () => onSelect?.(q.id),
            }}
            zIndexOffset={selected ? 1000 : completed ? 100 : 0}
          />
        );
      })}
    </>
  );
}

export default function QuestMapInner({
  quests,
  selectedId,
  flyToId,
  onSelect,
  onUserGeoChange,
  routeCoords,
  completedIds,
  hideLocateControl,
  locateNonce,
  className,
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
    <div className={`relative h-full w-full ${className ?? ""}`}>
      <MapBasemapControl value={basemapId} onChange={onBasemapChange} />
      <LocationPermissionBanner geo={userGeo} />
      {!hideLocateControl && <LocateMeControl geo={userGeo} mapRef={mapRef} />}
      <MapContainer
        center={[20, 0]}
        zoom={3}
        scrollWheelZoom
        zoomControl={false}
        className="h-full w-full !bg-[#0a121c]"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          key={hydratedBasemap ? basemap.id : "street"}
          attribution={basemap.attribution}
          url={basemap.url}
          maxZoom={basemap.maxZoom ?? 19}
          {...(basemap.subdomains ? { subdomains: basemap.subdomains } : {})}
        />
        <MapApiBridge mapRef={mapRef} />
        <FlyTo quests={quests} flyToId={flyToId} />
        <FitRoute coords={routeCoords} />
        <UserLocationLayer onGeoChange={handleGeoChange} />
        <FlyToUser geo={userGeo} locateNonce={locateNonce} />
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
        <VisibleQuestMarkers
          quests={quests}
          selectedId={selectedId}
          completedIds={completedIds}
          onSelect={onSelect}
        />
      </MapContainer>
    </div>
  );
}
