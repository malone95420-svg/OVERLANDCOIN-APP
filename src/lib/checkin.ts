/**
 * GPS check-in helpers — haversine distance + radius gate.
 * Quests store radiusMeters (default 100m). Completion requires user GPS inside that circle.
 */

export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in meters between two WGS84 points. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const DEFAULT_RADIUS_METERS = 100;

export type RadiusQuest = LatLng & { radiusMeters?: number };

/** True when user is within the quest check-in radius (defaults to 100m). */
export function isWithinRadius(user: LatLng, quest: RadiusQuest): boolean {
  const radius = quest.radiusMeters ?? DEFAULT_RADIUS_METERS;
  return haversineMeters(user, quest) <= radius;
}

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(2)} km`;
}
