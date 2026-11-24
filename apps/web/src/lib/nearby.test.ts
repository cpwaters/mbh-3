import { afterEach, describe, expect, it } from 'vitest';
import type { Listing } from '@mbh/domain';
import { DEFAULT_RADIUS_MILES, formatMiles, loadRadius, milesToMetres, saveRadius, withinRadius } from './nearby';
import type { RankedListing } from '../components/useNearbyListings';

const listing = (loadId: string) => ({ loadId }) as unknown as Listing;
const at = (loadId: string, miles: number | null): RankedListing => ({
  listing: listing(loadId),
  distanceMeters: miles === null ? null : milesToMetres(miles),
  pickup: miles === null ? null : { lat: 53, lng: -2 },
});

describe('withinRadius', () => {
  it('keeps loads within the radius, nearest first, and counts the rest', () => {
    const split = withinRadius([at('far', 40), at('near', 3), at('edge', 25), at('unknown', null), at('mid', 12)], 25);
    expect(split.inside.map((r) => r.listing.loadId)).toEqual(['near', 'mid', 'edge']);
    expect(split.outside).toBe(1);
    expect(split.unplaced).toBe(1);
  });

  it('finds more as the radius widens', () => {
    const ranked = [at('a', 8), at('b', 30), at('c', 80)];
    expect(withinRadius(ranked, 10).inside).toHaveLength(1);
    expect(withinRadius(ranked, 50).inside).toHaveLength(2);
    expect(withinRadius(ranked, 100).inside).toHaveLength(3);
  });
});

describe('formatMiles', () => {
  it('speaks in miles, with a decimal only when it matters', () => {
    expect(formatMiles(milesToMetres(3.42))).toBe('3.4 miles');
    expect(formatMiles(milesToMetres(1))).toBe('1.0 mile');
    expect(formatMiles(milesToMetres(27.4))).toBe('27 miles');
  });
});

describe('the remembered radius', () => {
  afterEach(() => window.localStorage.clear());

  it('defaults to 25 miles, and remembers a choice', () => {
    expect(loadRadius()).toBe(DEFAULT_RADIUS_MILES);
    saveRadius(50);
    expect(loadRadius()).toBe(50);
  });

  it('ignores anything stored that is not one of the options', () => {
    window.localStorage.setItem('mbh.nearbyRadiusMiles', '7');
    expect(loadRadius()).toBe(DEFAULT_RADIUS_MILES);
  });
});
