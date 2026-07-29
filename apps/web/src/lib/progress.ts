import type { GeoPoint } from './geocode';

// Great-circle (haversine) distance in metres between two coordinates.
// Mirrors the winding-free calculation the in-memory route provider uses.
export function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const R = 6_371_000; // Earth's mean radius, metres
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Journey progress (0–100) from the device's live position: how much of the
// origin→destination straight-line distance has been closed on the
// destination. Clamped so a driver who overshoots or wanders off-route still
// reads a sane value. This is the real GPS-linked progress that replaces the
// old status-derived visual.
export function journeyProgress(origin: GeoPoint, destination: GeoPoint, current: GeoPoint): number {
  const total = haversineMeters(origin, destination);
  if (total < 1) return 100; // origin and destination coincide — treat as arrived
  const remaining = haversineMeters(current, destination);
  const covered = total - remaining;
  return Math.max(0, Math.min(100, Math.round((covered / total) * 100)));
}

// Status-derived fallback, used for the progress bar before a GPS fix is
// available. Kept here so the Active Jobs card and the Map view share one
// definition instead of duplicating it.
export const STATUS_PROGRESS: Record<string, number> = {
  accepted: 20,
  collected: 55,
  in_transit: 85,
  delivered: 100,
  closed: 100,
};
