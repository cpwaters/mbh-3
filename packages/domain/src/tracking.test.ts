import { describe, expect, it } from 'vitest';
import { isJobTracked, isTrackingAllowed } from './tracking.js';

describe('isTrackingAllowed', () => {
  it('is on when nobody has switched it off, including companies that predate the switch', () => {
    expect(isTrackingAllowed({ shipper: {}, carrier: {}, driver: {} })).toBe(true);
    expect(isTrackingAllowed({ shipper: null, carrier: null, driver: null })).toBe(true);
  });

  it('is off when any one of the shipper, the carrier or the driver is switched off', () => {
    expect(isTrackingAllowed({ shipper: { trackingDisabled: true }, carrier: {}, driver: {} })).toBe(false);
    expect(isTrackingAllowed({ shipper: {}, carrier: { trackingDisabled: true }, driver: {} })).toBe(false);
    expect(isTrackingAllowed({ shipper: {}, carrier: {}, driver: { trackingDisabled: true } })).toBe(false);
  });
});

describe('isJobTracked', () => {
  it('treats an older job with no flag as tracked', () => {
    expect(isJobTracked({})).toBe(true);
    expect(isJobTracked({ trackingAllowed: true })).toBe(true);
    expect(isJobTracked({ trackingAllowed: false })).toBe(false);
  });
});
