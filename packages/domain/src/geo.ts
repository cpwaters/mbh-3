// Geographic value types. Zero dependencies. Coordinates are WGS84 decimal
// degrees; distances are integer metres and durations integer seconds so
// there is never a float-rounding surprise in stored values.

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RouteInfo {
  distanceMeters: number;
  durationSeconds: number;
}

// The system-written enrichment attached to a Load once the drain has
// geocoded its endpoints and computed the driving route between them. It is
// never user-supplied — only an outcome-recording system action writes it.
export interface LoadRoute {
  origin: GeoPoint;
  destination: GeoPoint;
  distanceMeters: number;
  durationSeconds: number;
  enrichedAt: string; // ISO-8601 UTC
}

const MAX_ABS_LAT = 90;
const MAX_ABS_LNG = 180;

export function isGeoPoint(value: unknown): value is GeoPoint {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.lat === 'number' &&
    Number.isFinite(p.lat) &&
    Math.abs(p.lat) <= MAX_ABS_LAT &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lng) <= MAX_ABS_LNG
  );
}
