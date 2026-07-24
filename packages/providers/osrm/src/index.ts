import type { GeoPoint, RouteInfo } from '@mbh/domain';
import { type RouteProvider, RouteProviderError } from '@mbh/provider-interfaces';
import { parseOsrmRoute } from '@mbh/wire';

export interface HttpResponse {
  status: number;
  json(): Promise<unknown>;
}
export type FetchLike = (url: string) => Promise<HttpResponse>;

export interface OsrmOptions {
  baseUrl?: string;
  fetch?: FetchLike;
}

// The ONLY place the OSRM routing HTTP endpoint is called. OSRM coordinates
// are lon,lat order. Shape validation + the domain mapping live in @mbh/wire;
// this adapter is just transport + error classification.
export class OsrmRouteProvider implements RouteProvider {
  private readonly baseUrl: string;
  private readonly doFetch: FetchLike;

  constructor(options: OsrmOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'https://router.project-osrm.org').replace(/\/+$/, '');
    this.doFetch = options.fetch ?? ((url) => fetch(url));
  }

  async drivingRoute(from: GeoPoint, to: GeoPoint): Promise<RouteInfo | null> {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url = `${this.baseUrl}/route/v1/driving/${coords}?overview=false`;

    let res: HttpResponse;
    try {
      res = await this.doFetch(url);
    } catch (cause) {
      throw new RouteProviderError(`OSRM request failed: ${String(cause)}`);
    }

    if (res.status !== 200) {
      throw new RouteProviderError(
        `OSRM returned HTTP ${res.status}`,
        res.status === 429 || res.status >= 500
      );
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch (cause) {
      throw new RouteProviderError(`OSRM response was not JSON: ${String(cause)}`);
    }

    const out = parseOsrmRoute(json);
    if (!out.ok) throw new RouteProviderError(out.message, false);
    return out.route;
  }
}
