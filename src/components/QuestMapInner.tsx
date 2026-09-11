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
  /** Explicit fly target — only set from Directions / list select / Locate. */
  flyToId?: string;
  /** Bumps only on explicit fly requests so GPS/filter churn never re-triggers flyTo. */
  flyNonce?: number;
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
  /** Coords from the locate tap — preferred over a second getCurrentPosition. */
  locateTo?: { lat: number; lng: number } | null;
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

function FlyTo({
  quests,
  flyToId,
  flyNonce,
}: {
  quests: Quest[];
  flyToId?: string;
  flyNonce?: number;
}) {
  const map = useMap();
  const questsRef = useRef(quests);
  questsRef.current = quests;

  useEffect(() => {
    if (!flyToId || !flyNonce) return;
    const q = questsRef.current.find((x) => x.id === flyToId);
    if (q) {
      map.flyTo([q.lat, q.lng], 13, { duration: 0.75 });
    }
    // Intentionally omit `quests` — filter refreshes must not re-fly.
  }, [map, flyToId, flyNonce]);
  return null;
}

function FlyToUser({
  geo,
  locateNonce,
  locateTo,
}: {
  geo: UserGeo;
  locateNonce?: number;
  locateTo?: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  const geoRef = useRef(geo);
  geoRef.current = geo;
  const locateToRef = useRef(locateTo);
  locateToRef.current = locateTo;

  useEffect(() => {
    if (!locateNonce) return;
    const target = locateToRef.current;
    if (target) {
      map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 14), {
        duration: 0.85,
      });
      return;
    }
    const g = geoRef.current;
    if (g.status === "watching") {
      map.flyTo([g.lat, g.lng], Math.max(map.getZoom(), 14), { duration: 0.85 });
    }
    // Only fly when user taps Locate (nonce bump) — never on GPS ticks.
  }, [locateNonce, map]);
  return null;
}

function FitRoute({ coords }: { coords: [number, number][] | null | undefined }) {
  const map = useMap();
  const fittedKeyRef = useRef<string>("");

  useEffect(() => {
    if (!coords || coords.length < 2) {
      fittedKeyRef.current = "";
      return;
    }
    // Fingerprint so identical routes from new array refs don't re-fit / shake
    const key = `${coords.length}:${coords[0][0].toFixed(5)},${coords[0][1].toFixed(5)}:${coords[coords.length - 1][0].toFixed(5)},${coords[coords.length - 1][1].toFixed(5)}`;
    if (key === fittedKeyRef.current) return;
    fittedKeyRef.current = key;
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
  const throttleRef = useRef<number | null>(null);

  useMapEvents({
    moveend: () => {
      if (throttleRef.current != null) return;
      throttleRef.current = window.setTimeout(() => {
        throttleRef.current = null;
        setVersion((v) => v + 1);
      }, 80);
    },
    zoomend: () => {
      if (throttleRef.current != null) window.clearTimeout(throttleRef.current);
      throttleRef.current = window.setTimeout(() => {
        throttleRef.current = null;
        setVersion((v) => v + 1);
      }, 80);
    },
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
  flyNonce,
  onSelect,
  onUserGeoChange,
  routeCoords,
  completedIds,
  hideLocateControl,
  locateNonce,
  locateTo,
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
  // Stable tile key: avoid remounting MapContainer; only swap TileLayer when basemap id changes
  const tileKey = hydratedBasemap ? basemap.id : "street-pending";

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
        attributionControl={false}
        preferCanvas
        className="h-full w-full !bg-[#0a121c]"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          key={tileKey}
          url={basemap.url}
          maxZoom={basemap.maxZoom ?? 19}
          {...(basemap.subdomains ? { subdomains: basemap.subdomains } : {})}
        />
        <MapApiBridge mapRef={mapRef} />
        <FlyTo quests={quests} flyToId={flyToId} flyNonce={flyNonce} />
        <FitRoute coords={routeCoords} />
        <UserLocationLayer onGeoChange={handleGeoChange} />
        <FlyToUser geo={userGeo} locateNonce={locateNonce} locateTo={locateTo} />
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
