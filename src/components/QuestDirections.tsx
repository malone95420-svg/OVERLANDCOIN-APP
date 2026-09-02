"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Quest } from "@/lib/quests";
import type { UserGeo } from "./UserLocationLayer";
import {
  appleMapsDirectionsUrl,
  fetchOsrmDrivingRoute,
  formatDistance,
  formatDuration,
  googleMapsDirectionsUrl,
} from "@/lib/questDirections";

type Props = {
  quest: Quest;
  userGeo: UserGeo;
  /** Called with Leaflet [lat,lng] polyline when an in-map route is ready; null to clear. */
  onRouteChange: (coords: [number, number][] | null) => void;
  /** Compact button row for quest cards. */
  compact?: boolean;
  /** When true, open and draw the in-map route on mount (after explicit Find quest). */
  autoStart?: boolean;
};

export function QuestDirections({
  quest,
  userGeo,
  onRouteChange,
  compact,
  autoStart = false,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [open, setOpen] = useState(autoStart);
  const abortRef = useRef<AbortController | null>(null);
  const autoStartedRef = useRef(false);

  const watchingLat = userGeo.status === "watching" ? userGeo.lat : null;
  const watchingLng = userGeo.status === "watching" ? userGeo.lng : null;

  const origin = useMemo(() => {
    if (watchingLat == null || watchingLng == null) return null;
    return { lat: watchingLat, lng: watchingLng };
  }, [watchingLat, watchingLng]);

  const destination = useMemo(
    () => ({ lat: quest.lat, lng: quest.lng }),
    [quest.lat, quest.lng],
  );

  const clearRoute = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    onRouteChange(null);
    setSummary(null);
    setError(null);
    setBusy(false);
  }, [onRouteChange]);

  const drawInMapRoute = useCallback(async () => {
    setError(null);
    setSummary(null);
    if (!origin) {
      setError("Enable location for in-map route");
      onRouteChange(null);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    const result = await fetchOsrmDrivingRoute(origin, destination, ac.signal);
    if (ac.signal.aborted) return;
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      onRouteChange(null);
      return;
    }
    onRouteChange(result.coords);
    setSummary(
      `${formatDistance(result.distanceMeters)} · ~${formatDuration(result.durationSeconds)}`,
    );
  }, [origin, destination, onRouteChange]);

  useEffect(() => {
    clearRoute();
    setOpen(autoStart);
    autoStartedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quest.id]);

  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    setOpen(true);
    void drawInMapRoute();
    // Only auto-start once per mount / quest; origin may arrive later via userGeo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, quest.id]);

  // If autoStart ran before location was ready, retry once watching starts.
  useEffect(() => {
    if (!autoStart || !open || !origin || summary || busy) return;
    void drawInMapRoute();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const googleHref = googleMapsDirectionsUrl(destination, origin);
  const appleHref = appleMapsDirectionsUrl(destination, origin);

  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary !py-1.5 !text-xs"
          aria-expanded={open}
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next) {
              void drawInMapRoute();
            } else {
              clearRoute();
            }
          }}
        >
          {busy ? "Routing…" : open ? "Hide directions" : "Find quest"}
        </button>
        {open && summary && (
          <span className="self-center text-[11px] text-cyan-accent">{summary}</span>
        )}
      </div>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-border bg-bg-card/60 px-3 py-2">
          {!origin && (
            <p className="text-[11px] text-amber-300">
              Enable location for in-map route. Native map apps still work with destination only.
            </p>
          )}
          {error && <p className="text-[11px] text-amber-300">{error}</p>}
          <div className="flex flex-wrap gap-2">
            {origin && (
              <button
                type="button"
                className="rounded-md border border-border px-2.5 py-1 text-[11px] text-slate-200 hover:border-cyan-accent/50 hover:text-cyan-accent disabled:opacity-50"
                disabled={busy}
                onClick={() => void drawInMapRoute()}
              >
                {busy ? "Drawing route…" : "Show route on map"}
              </button>
            )}
            <a
              href={googleHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-2.5 py-1 text-[11px] text-slate-200 hover:border-cyan-accent/50 hover:text-cyan-accent"
            >
              Open in Google Maps
            </a>
            <a
              href={appleHref}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-border px-2.5 py-1 text-[11px] text-slate-200 hover:border-cyan-accent/50 hover:text-cyan-accent"
            >
              Open in Apple Maps
            </a>
            {summary && (
              <button
                type="button"
                className="rounded-md border border-border px-2.5 py-1 text-[11px] text-slate-400 hover:text-slate-200"
                onClick={clearRoute}
              >
                Clear route
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-500">
            In-map route via public OSRM (no API key). Turn-by-turn uses Google/Apple apps.
          </p>
        </div>
      )}
    </div>
  );
}
