import { describe, expect, it } from 'vitest';
import { RouteProviderError } from '@mbh/provider-interfaces';
import { OsrmRouteProvider, type FetchLike } from './index.js';

function fakeFetch(status: number, body: unknown): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    return { status, json: async () => body };
  };
  return { fetch, calls };
}

const LONDON = { lat: 51.501, lng: -0.1416 };
const MANCHESTER = { lat: 53.4, lng: -2.2 };

describe('OsrmRouteProvider', () => {
  it('maps an Ok route to integer metres/seconds and builds a lon,lat URL', async () => {
    const { fetch, calls } = fakeFetch(200, {
      code: 'Ok',
      routes: [{ distance: 12345.6, duration: 789.4 }],
    });
    const rp = new OsrmRouteProvider({ baseUrl: 'https://osrm.test', fetch });
    expect(await rp.drivingRoute(LONDON, MANCHESTER)).toEqual({
      distanceMeters: 12346,
      durationSeconds: 789,
    });
    expect(calls[0]).toBe(
      'https://osrm.test/route/v1/driving/-0.1416,51.501;-2.2,53.4?overview=false'
    );
  });

  it('returns null when OSRM reports NoRoute', async () => {
    const { fetch } = fakeFetch(200, { code: 'NoRoute', routes: [] });
    expect(await new OsrmRouteProvider({ fetch }).drivingRoute(LONDON, MANCHESTER)).toBeNull();
  });

  it('throws a retryable error on 5xx', async () => {
    const { fetch } = fakeFetch(500, {});
    await expect(
      new OsrmRouteProvider({ fetch }).drivingRoute(LONDON, MANCHESTER)
    ).rejects.toMatchObject({ recoverable: true });
  });

  it('throws a non-retryable error on an unparseable body', async () => {
    const { fetch } = fakeFetch(200, { code: 'Ok', routes: [{ distance: 'x', duration: 1 }] });
    await expect(
      new OsrmRouteProvider({ fetch }).drivingRoute(LONDON, MANCHESTER)
    ).rejects.toBeInstanceOf(RouteProviderError);
  });
});
