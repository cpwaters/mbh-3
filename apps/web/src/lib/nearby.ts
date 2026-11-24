import type { RankedListing } from '../components/useNearbyListings';

// "Loads near you": which available loads are within the driver's chosen
// radius of where their phone is. Miles, because UK road distances are miles.

export const RADIUS_OPTIONS_MILES = [10, 25, 50, 100] as const;
export type RadiusMiles = (typeof RADIUS_OPTIONS_MILES)[number];
export const DEFAULT_RADIUS_MILES: RadiusMiles = 25;

const METRES_PER_MILE = 1609.344;

export function metresToMiles(metres: number): number {
  return metres / METRES_PER_MILE;
}

export function milesToMetres(miles: number): number {
  return miles * METRES_PER_MILE;
}

// One decimal under ten miles, whole miles beyond — "3.4 miles", "27 miles".
export function formatMiles(metres: number): string {
  const miles = metresToMiles(metres);
  const shown = miles < 10 ? miles.toFixed(1) : String(Math.round(miles));
  return `${shown} ${shown === '1.0' ? 'mile' : 'miles'}`;
}

export interface RadiusSplit {
  // Inside the radius, nearest first.
  inside: RankedListing[];
  // Placed, but further than the radius — counted so the driver knows
  // widening it would find more.
  outside: number;
  // Not placed yet: the pickup postcode has not been located, or the phone
  // has no fix. Never presented as near or far.
  unplaced: number;
}

// Straight-line distance from the phone to the pickup — the same measure the
// Available Loads list sorts by. A driver's road miles will be more; the
// radius is a "roughly how far" filter, not a route.
export function withinRadius(ranked: readonly RankedListing[], radiusMiles: number): RadiusSplit {
  const limit = milesToMetres(radiusMiles);
  const inside: RankedListing[] = [];
  let outside = 0;
  let unplaced = 0;
  for (const r of ranked) {
    if (r.distanceMeters === null) unplaced += 1;
    else if (r.distanceMeters <= limit) inside.push(r);
    else outside += 1;
  }
  inside.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
  return { inside, outside, unplaced };
}

// The radius the driver last chose, remembered on this phone only. Storage
// can be unavailable (private mode, blocked site data); the default stands in.
const STORAGE_KEY = 'mbh.nearbyRadiusMiles';

export function loadRadius(): RadiusMiles {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return (RADIUS_OPTIONS_MILES as readonly number[]).includes(stored) ? (stored as RadiusMiles) : DEFAULT_RADIUS_MILES;
  } catch {
    return DEFAULT_RADIUS_MILES;
  }
}

export function saveRadius(radius: RadiusMiles): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(radius));
  } catch {
    /* not remembered — harmless */
  }
}
