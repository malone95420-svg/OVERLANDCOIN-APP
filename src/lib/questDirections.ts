/**
 * Key-free quest directions helpers: OSRM demo routing + native map deep links.
 */

export type LatLng = { lat: number; lng: number };

/** Google Maps directions (destination-only or origin+destination). */
export function googleMapsDirectionsUrl(
  destination: LatLng,
  origin?: LatLng | null,
): string {
  const dest = `${destination.lat},${destination.lng}`;
  if (origin) {
    return `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${dest}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

/** Apple Maps directions — https works cross-platform; maps:// preferred on iOS. */
export function appleMapsDirectionsUrl(
  destination: LatLng,
  origin?: LatLng | null,
): string {
  const daddr = `${destination.lat},${destination.lng}`;
  if (origin) {
    return `https://maps.apple.com/?saddr=${origin.lat},${origin.lng}&daddr=${daddr}`;
  }
  return `https://maps.apple.com/?daddr=${daddr}`;
}

export type OsrmResult =
  | { ok: true; coords: [number, number][]; distanceMeters: number; durationSeconds: number }
  | { ok: false; message: string };

/**
 * Fetch a driving route from the public OSRM demo server (no API key).
 * Returns Leaflet-friendly [lat, lng] pairs for Polyline.
 */
export async function fetchOsrmDrivingRoute(
  from: LatLng,
  to: LatLng,
  signal?: AbortSignal,
): Promise<OsrmResult> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.lng},${from.lat};${to.lng},${to.lat}` +
    `?overview=full&geometries=geojson`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      return { ok: false, message: `Routing unavailable (${res.status}). Try Google or Apple Maps.` };
    }
    const data = (await res.json()) as {
      code?: string;
      message?: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry?: { coordinates?: [number, number][] };
      }>;
    };
    if (data.code !== "Ok" || !data.routes?.[0]?.geometry?.coordinates?.length) {
      return {
        ok: false,
        message: data.message || "No driving route found. Try Google or Apple Maps.",
      };
    }
    const route = data.routes[0];
    // GeoJSON is [lng, lat] → Leaflet wants [lat, lng]
    const coords: [number, number][] = route.geometry!.coordinates!.map(([lng, lat]) => [
      lat,
      lng,
    ]);
    return {
      ok: true,
      coords,
      distanceMeters: route.distance,
      durationSeconds: route.duration,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, message: "Route request cancelled." };
    }
    return {
      ok: false,
      message: "Could not reach the routing service. Try Google or Apple Maps.",
    };
  }
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h} h ${rem} min` : `${h} h`;
}
