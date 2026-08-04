import { describe, expect, it } from 'vitest';
import { isGeoPoint, metersToMiles } from './geo.js';

describe('metersToMiles', () => {
  it('converts a known distance', () => {
    // Manchester -> Edinburgh is roughly 220 driving miles.
    expect(metersToMiles(354_056)).toBeCloseTo(220, 0);
  });

  it('converts zero', () => {
    expect(metersToMiles(0)).toBe(0);
  });
});

describe('isGeoPoint', () => {
  it('accepts a valid point', () => {
    expect(isGeoPoint({ lat: 53.4, lng: -2.2 })).toBe(true);
  });

  it('rejects an out-of-range latitude', () => {
    expect(isGeoPoint({ lat: 91, lng: 0 })).toBe(false);
  });

  it('rejects a non-numeric field', () => {
    expect(isGeoPoint({ lat: '53', lng: -2 })).toBe(false);
  });

  it('rejects null', () => {
    expect(isGeoPoint(null)).toBe(false);
  });
});
