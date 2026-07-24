import { describe, expect, it } from 'vitest';
import { GeocoderError, RouteProviderError } from '@mbh/provider-interfaces';
import { InMemoryGeocoder } from './in-memory-geocoder.js';
import { InMemoryRouteProvider } from './in-memory-route-provider.js';

describe('InMemoryGeocoder', () => {
  it('resolves a seeded postcode regardless of spacing/case', async () => {
    const geo = new InMemoryGeocoder({ 'SW1A 1AA': { lat: 51.5, lng: -0.14 } });
    expect(await geo.lookup('sw1a1aa')).toEqual({ lat: 51.5, lng: -0.14 });
  });

  it('returns null for an unseeded postcode', async () => {
    expect(await new InMemoryGeocoder().lookup('ZZ99 9ZZ')).toBeNull();
  });

  it('throws a retryable error once when scripted, then recovers', async () => {
    const geo = new InMemoryGeocoder({ 'M1 1AE': { lat: 53.4, lng: -2.2 } }).failOnce();
    await expect(geo.lookup('M1 1AE')).rejects.toBeInstanceOf(GeocoderError);
    expect(await geo.lookup('M1 1AE')).toEqual({ lat: 53.4, lng: -2.2 });
  });
});

describe('InMemoryRouteProvider', () => {
  it('derives a deterministic, plausible route from the straight-line distance', async () => {
    const rp = new InMemoryRouteProvider();
    const a = await rp.drivingRoute({ lat: 51.5, lng: -0.14 }, { lat: 53.4, lng: -2.2 });
    const b = await rp.drivingRoute({ lat: 51.5, lng: -0.14 }, { lat: 53.4, lng: -2.2 });
    expect(a).toEqual(b); // deterministic
    expect(a?.distanceMeters).toBeGreaterThan(200_000);
    expect(a?.durationSeconds).toBeGreaterThan(0);
  });

  it('honours a scripted override', async () => {
    const from = { lat: 1, lng: 1 };
    const to = { lat: 2, lng: 2 };
    const rp = new InMemoryRouteProvider().set(from, to, { distanceMeters: 42, durationSeconds: 7 });
    expect(await rp.drivingRoute(from, to)).toEqual({ distanceMeters: 42, durationSeconds: 7 });
  });

  it('throws a retryable error once when scripted', async () => {
    const rp = new InMemoryRouteProvider().failOnce();
    await expect(rp.drivingRoute({ lat: 1, lng: 1 }, { lat: 2, lng: 2 })).rejects.toBeInstanceOf(
      RouteProviderError
    );
  });
});
