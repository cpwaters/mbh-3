import type { GeoPoint, RouteInfo } from '@mbh/domain';

// Compute the driving route between two coordinates. The real adapter (OSRM)
// and the in-memory mock both satisfy this. Returns null when no route exists
// (e.g. across water with no ferry); throws RouteProviderError only for a
// transport/parse failure the caller should retry.
export interface RouteProvider {
  drivingRoute(from: GeoPoint, to: GeoPoint): Promise<RouteInfo | null>;
}

export class RouteProviderError extends Error {
  readonly recoverable: boolean;
  constructor(message: string, recoverable = true) {
    super(message);
    this.name = 'RouteProviderError';
    this.recoverable = recoverable;
  }
}
