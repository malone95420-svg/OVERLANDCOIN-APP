"use client";

import { useEffect, useRef, useState } from "react";
import type { UserGeo } from "./UserLocationLayer";
import type { WeatherApiResponse, WeatherPayload } from "@/lib/weather";

const POLL_MS = 7 * 60_000;
const MOVE_REFRESH_METERS = 5000;

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

type Props = {
  geo: UserGeo;
  className?: string;
};

/**
 * Compact live-weather chip for the user's GPS position.
 * Polls /api/weather (~7 min) and refreshes when location moves ~5km+.
 */
export function LiveWeatherChip({ geo, className }: Props) {
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastFetchRef = useRef<{ lat: number; lng: number; at: number } | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

  const watching = geo.status === "watching";
  const lat = watching ? geo.lat : null;
  const lng = watching ? geo.lng : null;

  useEffect(() => {
    if (geo.status === "denied" || geo.status === "unavailable") {
      setWeather(null);
      setError(null);
      setLoading(false);
      return;
    }
    if (lat == null || lng == null) return;

    const shouldFetch = (force: boolean) => {
      if (force) return true;
      const prev = lastFetchRef.current;
      if (!prev) return true;
      const moved = haversineMeters(prev, { lat, lng });
      if (moved >= MOVE_REFRESH_METERS) return true;
      if (Date.now() - prev.at >= POLL_MS) return true;
      return false;
    };

    const fetchWeather = async (force = false) => {
      if (!shouldFetch(force)) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/weather?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(String(lng))}`,
          { signal: ac.signal },
        );
        const data = (await res.json()) as WeatherApiResponse;
        if (!data.ok) {
          setError(data.error || "Weather unavailable");
          return;
        }
        setWeather({
          lat: data.lat,
          lng: data.lng,
          tempF: data.tempF,
          tempC: data.tempC,
          windMph: data.windMph,
          windKmh: data.windKmh,
          weatherCode: data.weatherCode,
          condition: data.condition,
          emoji: data.emoji,
          updatedAt: data.updatedAt,
          source: data.source,
        });
        lastFetchRef.current = { lat, lng, at: Date.now() };
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return;
        setError("Weather unavailable");
      } finally {
        setLoading(false);
      }
    };

    void fetchWeather(true);
    const id = window.setInterval(() => {
      void fetchWeather(false);
    }, POLL_MS);

    return () => {
      window.clearInterval(id);
      abortRef.current?.abort();
    };
  }, [geo.status, lat, lng]);

  if (geo.status === "denied" || geo.status === "unavailable") {
    return null;
  }

  if (!watching && !weather) {
    return null;
  }

  if (!weather && !loading && !error) {
    return null;
  }

  return (
    <div
      className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/75 px-2.5 py-1 text-[11px] font-medium text-slate-100 shadow-lg backdrop-blur-md ${className ?? ""}`}
      title={
        weather
          ? `Live weather · updated ${new Date(weather.updatedAt).toLocaleTimeString()}`
          : "Live weather"
      }
      role="status"
      aria-live="polite"
    >
      {weather ? (
        <>
          <span aria-hidden>{weather.emoji}</span>
          <span className="font-semibold text-gold-bright">
            {weather.tempF}°F
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-200">{weather.condition}</span>
          <span className="hidden text-slate-400 sm:inline">·</span>
          <span className="hidden text-cyan-accent/90 sm:inline">
            {weather.windMph} mph
          </span>
        </>
      ) : loading ? (
        <span className="text-slate-400">Weather…</span>
      ) : (
        <span className="text-amber-200/90">
          {error ?? "Weather unavailable"}
        </span>
      )}
    </div>
  );
}
