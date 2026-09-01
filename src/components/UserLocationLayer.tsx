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
 * Clears the watch on unmount. Optional heading cone when the device reports it.
 */
export function UserLocationLayer({ onGeoChange }: Props) {
  const map = useMap();
  const [geo, setGeo] = useState<UserGeo>({ status: "idle" });
  const watchIdRef = useRef<number | null>(null);
  const onGeoChangeRef = useRef(onGeoChange);
  onGeoChangeRef.current = onGeoChange;

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
        const heading = pos.coords.heading;
        updateGeo({
          status: "watching",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 0,
          heading: heading != null && Number.isFinite(heading) ? heading : null,
        });
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
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [updateGeo]);

  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 100);
    return () => window.clearTimeout(t);
  }, [map]);

  const icon = useMemo(() => {
    if (geo.status !== "watching") return null;
    return locationIcon(geo.heading);
  }, [geo]);

  if (geo.status !== "watching" || !icon) return null;

  const radius = Math.max(geo.accuracy || 0, 8);

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
      className="pointer-events-none absolute left-3 right-14 top-12 z-[1000] sm:right-auto sm:max-w-sm"
      role="status"
    >
      <div className="rounded-lg border border-amber-500/40 bg-bg-panel/95 px-3 py-2 text-xs text-amber-100 shadow-lg backdrop-blur-sm">
        {geo.message}
      </div>
    </div>
  );
}
