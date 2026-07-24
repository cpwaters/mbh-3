import type { GeoPoint, RouteInfo } from '@mbh/domain';
import { type RouteProvider, RouteProviderError } from '@mbh/provider-interfaces';

const EARTH_RADIUS_M = 6_371_000;
// Great-circle distance underestimates road distance; a fixed winding factor
// keeps the mock's numbers plausible and, crucially, deterministic.
const ROAD_WINDING_FACTOR = 1.3;
const AVERAGE_SPEED_MPS = 13.9; // ~50 km/h

function haversineMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// Deterministic in-memory RouteProvider — the CI default. By default it
// derives a plausible driving route from the straight-line distance; scripted
// overrides (keyed on from|to) pin exact values, and `failOnce` forces one
// retryable error for the drain's backoff path.
export class InMemoryRouteProvider implements RouteProvider {
  private readonly scripted = new Map<string, RouteInfo | null>();
  private failNext = false;

  private key(from: GeoPoint, to: GeoPoint): string {
    return `${from.lat},${from.lng}|${to.lat},${to.lng}`;
  }

  set(from: GeoPoint, to: GeoPoint, route: RouteInfo | null): this {
    this.scripted.set(this.key(from, to), route);
    return this;
  }

  failOnce(): this {
    this.failNext = true;
    return this;
  }

  async drivingRoute(from: GeoPoint, to: GeoPoint): Promise<RouteInfo | null> {
    if (this.failNext) {
      this.failNext = false;
      throw new RouteProviderError('scripted route failure');
    }
    const scripted = this.scripted.get(this.key(from, to));
    if (scripted !== undefined) return scripted;

    const distanceMeters = Math.round(haversineMeters(from, to) * ROAD_WINDING_FACTOR);
    const durationSeconds = Math.round(distanceMeters / AVERAGE_SPEED_MPS);
    return { distanceMeters, durationSeconds };
  }
}
