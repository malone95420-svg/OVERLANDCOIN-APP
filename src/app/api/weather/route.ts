import { NextRequest, NextResponse } from "next/server";
import {
  weatherCodeEmoji,
  weatherCodeLabel,
  type WeatherApiResponse,
  type WeatherPayload,
} from "@/lib/weather";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { body: WeatherPayload; expiresAt: number }>();

function cacheKey(lat: number, lng: number): string {
  // ~1.1km grid — enough for chip UX, cuts Open-Meteo fan-out
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

function parseCoord(raw: string | null, name: string): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (name === "lat" && (n < -90 || n > 90)) return null;
  if (name === "lng" && (n < -180 || n > 180)) return null;
  return n;
}

export async function GET(req: NextRequest) {
  const lat = parseCoord(req.nextUrl.searchParams.get("lat"), "lat");
  const lng = parseCoord(req.nextUrl.searchParams.get("lng"), "lng");

  if (lat == null || lng == null) {
    const body: WeatherApiResponse = {
      ok: false,
      error: "Query params lat and lng are required (valid numbers).",
    };
    return NextResponse.json(body, { status: 400 });
  }

  const key = cacheKey(lat, lng);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) {
    return NextResponse.json(
      { ok: true, ...hit.body } satisfies WeatherApiResponse,
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120",
        },
      },
    );
  }

  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "current",
    "temperature_2m,weather_code,wind_speed_10m",
  );
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", "auto");

  try {
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      const body: WeatherApiResponse = {
        ok: false,
        error: `Open-Meteo HTTP ${res.status}`,
      };
      return NextResponse.json(body, { status: 502 });
    }
    const data = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        weather_code?: number;
        wind_speed_10m?: number;
      };
    };
    const cur = data.current;
    if (
      !cur ||
      typeof cur.temperature_2m !== "number" ||
      typeof cur.weather_code !== "number"
    ) {
      const body: WeatherApiResponse = {
        ok: false,
        error: "Unexpected Open-Meteo response",
      };
      return NextResponse.json(body, { status: 502 });
    }

    const tempF = cur.temperature_2m;
    const windMph =
      typeof cur.wind_speed_10m === "number" ? cur.wind_speed_10m : 0;
    const code = cur.weather_code;
    const payload: WeatherPayload = {
      lat,
      lng,
      tempF: Math.round(tempF),
      tempC: Math.round(((tempF - 32) * 5) / 9),
      windMph: Math.round(windMph),
      windKmh: Math.round(windMph * 1.60934),
      weatherCode: code,
      condition: weatherCodeLabel(code),
      emoji: weatherCodeEmoji(code),
      updatedAt: now,
      source: "open-meteo",
    };
    cache.set(key, { body: payload, expiresAt: now + CACHE_TTL_MS });

    return NextResponse.json(
      { ok: true, ...payload } satisfies WeatherApiResponse,
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120",
        },
      },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Weather fetch failed";
    const body: WeatherApiResponse = { ok: false, error: message };
    return NextResponse.json(body, { status: 502 });
  }
}
