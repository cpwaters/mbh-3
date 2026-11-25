import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURE_FLAGS, FEATURES, resolveFeatureFlags } from './features.js';

describe('feature flags', () => {
  it('reads every feature as off until it is switched on', () => {
    expect(DEFAULT_FEATURE_FLAGS).toEqual({ ratings: false, shipperCarrier: false });
    expect(resolveFeatureFlags(null)).toEqual(DEFAULT_FEATURE_FLAGS);
    expect(resolveFeatureFlags({})).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it('takes stored switches, ignoring unknown keys and non-booleans', () => {
    expect(resolveFeatureFlags({ ratings: true, updatedAt: '2026-11-25T00:00:00Z', bogus: true })).toEqual({
      ratings: true,
      shipperCarrier: false,
    });
    expect(resolveFeatureFlags({ ratings: 'yes' })).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it('lists each feature once for the Features page', () => {
    const keys = FEATURES.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.sort()).toEqual(Object.keys(DEFAULT_FEATURE_FLAGS).sort());
  });
});
