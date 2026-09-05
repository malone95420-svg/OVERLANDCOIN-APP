"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Marker, useMap } from "react-leaflet";
import L from "leaflet";

export type UserGeo =
  | { status: "idle" }
  | { status: "watching"; lat: number; lng: number; accuracy: number; heading: number | null }
  | { status: "denied"; message: string }
  | { status: "unavailable"; message: string };

type Props = {
  onGeoChange?: (geo: UserGeo) => void;
};

function locationIcon(heading: number | null): L.DivIcon {
  const rotate =
    heading != null && Number.isFinite(heading)
      ? `<div style="position:absolute;left:50%;top:50%;width:0;height:0;margin-left:-6px;margin-top:-22px;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:14px solid #38bdf8;transform:rotate(${heading}deg);transform-origin:50% 22px;opacity:0.95;"></div>`
      : "";
  return L.divIcon({
    className: "olc-user-location-icon",
    html: `<div style="position:relative;width:22px;height:22px;">
      ${rotate}
      <div style="position:absolute;inset:3px;border-radius:9999px;background:#2563eb;border:2.5px solid #fff;box-shadow:0 0 0 2px rgba(37,99,235,0.35),0 1px 4px rgba(0,0,0,0.45);"></div>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Exposes the Leaflet map instance to a parent ref (for Locate Me outside MapContainer). */
export function MapApiBridge({
  mapRef,
}: {
  mapRef: React.MutableRefObject<L.Map | null>;
}) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    return () => {
      mapRef.current = null;
    };
  }, [map, mapRef]);
  return null;
}

/**
 * Watches GPS while the map is mounted: blue accuracy circle + location marker.
 * Debounces watchPosition updates so the map does not vibrate on every GPS tick.
 */
export function UserLocationLayer({ onGeoChange }: Props) {
  const map = useMap();
  const [geo, setGeo] = useState<UserGeo>({ status: "idle" });
  const watchIdRef = useRef<number | null>(null);
  const onGeoChangeRef = useRef(onGeoChange);
  onGeoChangeRef.current = onGeoChange;
  const lastEmittedRef = useRef<{
    lat: number;
    lng: number;
    accuracy: number;
    heading: number | null;
    at: number;
  } | null>(null);
  const pendingTimerRef = useRef<number | null>(null);
  const latestPosRef = useRef<GeolocationPosition | null>(null);

  const emitWatching = useCallback((pos: GeolocationPosition, force = false) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    const accuracy = pos.coords.accuracy || 0;
    const rawHeading = pos.coords.heading;
    const heading =
      rawHeading != null && Number.isFinite(rawHeading) ? rawHeading : null;
    const prev = lastEmittedRef.current;
    const now = Date.now();

    if (!force && prev) {
      const moved = haversineMeters(prev, { lat, lng });
      const accDelta = Math.abs(accuracy - prev.accuracy);
      const headingDelta =
        heading != null && prev.heading != null
          ? Math.abs(heading - prev.heading)
          : heading !== prev.heading
            ? 999
            : 0;
      // Ignore sub-meter GPS jitter and rapid heading flicker
      if (moved < 4 && accDelta < 8 && headingDelta < 12 && now - prev.at < 1200) {
        return;
      }
      // Hard debounce: at most ~1.5 Hz meaningful updates
      if (now - prev.at < 650 && moved < 12) {
        return;
      }
    }

    lastEmittedRef.current = { lat, lng, accuracy, heading, at: now };
    const next: UserGeo = {
      status: "watching",
      lat,
      lng,
      accuracy,
      heading,
    };
    setGeo(next);
    onGeoChangeRef.current?.(next);
  }, []);

  const updateGeo = useCallback((next: UserGeo) => {
    setGeo(next);
    onGeoChangeRef.current?.(next);
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      updateGeo({
        status: "unavailable",
        message: "Geolocation is not supported in this browser.",
      });
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        latestPosRef.current = pos;
        // Coalesce GPS ticks into a single emit shortly after movement settles
        if (pendingTimerRef.current != null) {
          window.clearTimeout(pendingTimerRef.current);
        }
        const first = lastEmittedRef.current == null;
        pendingTimerRef.current = window.setTimeout(
          () => {
            pendingTimerRef.current = null;
            if (latestPosRef.current) emitWatching(latestPosRef.current, first);
          },
          first ? 0 : 400,
        );
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          updateGeo({
            status: "denied",
            message: "Location permission denied. Enable it to see yourself on the map.",
          });
        } else {
          updateGeo({
            status: "unavailable",
            message: err.message || "Could not read GPS position.",
          });
        }
      },
      { enableHighAccuracy: true, maximumAge: 8000, timeout: 20000 },
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (pendingTimerRef.current != null) {
        window.clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
    };
  }, [updateGeo, emitWatching]);

  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize({ animate: false }), 120);
    return () => window.clearTimeout(t);
  }, [map]);

  const icon = useMemo(() => {
    if (geo.status !== "watching") return null;
    return locationIcon(geo.heading);
  }, [geo]);

  if (geo.status !== "watching" || !icon) return null;

  // Round accuracy for Circle radius so small GPS noise doesn't redraw the path
  const radius = Math.max(Math.round((geo.accuracy || 0) / 2) * 2, 8);

  return (
    <>
      <Circle
        center={[geo.lat, geo.lng]}
        radius={radius}
        pathOptions={{
          color: "#3b82f6",
          fillColor: "#3b82f6",
          fillOpacity: 0.15,
          weight: 1.5,
          opacity: 0.55,
        }}
      />
      <Marker position={[geo.lat, geo.lng]} icon={icon} interactive={false} />
    </>
  );
}

type LocateProps = {
  geo: UserGeo;
  mapRef: React.MutableRefObject<L.Map | null>;
};

/** "Locate me" control — flies to last watched position, or prompts for GPS. */
export function LocateMeControl({ geo, mapRef }: LocateProps) {
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const flyToUser = useCallback(() => {
    setHint(null);
    const map = mapRef.current;
    if (!map) {
      setHint("Map not ready.");
      return;
    }
    if (geo.status === "watching") {
      const zoom = Math.max(map.getZoom(), 14);
      map.flyTo([geo.lat, geo.lng], zoom, { duration: 0.85 });
      return;
    }
    if (geo.status === "denied") {
      setHint("Location permission denied.");
      return;
    }
    if (!navigator.geolocation) {
      setHint("Geolocation unavailable.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        map.flyTo([pos.coords.latitude, pos.coords.longitude], Math.max(map.getZoom(), 14), {
          duration: 0.85,
        });
      },
      (err) => {
        setBusy(false);
        setHint(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied."
            : err.message || "Could not get location.",
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
    );
  }, [geo, mapRef]);

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 z-[1000] flex flex-col items-end gap-1">
      {hint && (
        <div className="max-w-[220px] rounded-md border border-border bg-bg-panel/95 px-2 py-1 text-[11px] text-slate-300 shadow">
          {hint}
        </div>
      )}
      <button
        type="button"
        onClick={flyToUser}
        disabled={busy}
        title="Locate me"
        aria-label="Locate me"
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-bg-panel/95 text-cyan-accent shadow-lg backdrop-blur-sm transition hover:bg-white/5 disabled:opacity-60"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
          <path
            d="M12 2v3M12 19v3M2 12h3M19 12h3"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        </svg>
      </button>
    </div>
  );
}

export function LocationPermissionBanner({ geo }: { geo: UserGeo }) {
  if (geo.status !== "denied" && geo.status !== "unavailable") return null;
  return (
    <div
      className="pointer-events-none absolute left-3 right-14 top-28 z-[1000] sm:right-auto sm:max-w-sm md:top-16"
      role="status"
    >
      <div className="rounded-lg border border-amber-500/40 bg-bg-panel/95 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur-sm">
        {geo.message}
      </div>
    </div>
  );
}
