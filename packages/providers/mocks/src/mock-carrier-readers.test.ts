import { describe, expect, it } from 'vitest';
import type { Listing } from '@mbh/domain';
import { MockListingReader, MockMembershipReader } from './mock-carrier-readers.js';

const listing: Listing = {
  loadId: 'load-1',
  shipperTenantId: 'shipper-1',
  origin: { town: 'Trafford', postcode: 'M17 1WS' },
  destination: { town: 'Leith', postcode: 'EH6 6JJ' },
  description: 'Mixed pallets',
  weightKg: 14200,
  palletCount: 16,
  priceGbpPence: 68000,
  pickupBy: '2026-08-02',
  deliverBy: '2026-08-03',
  postedAt: '2026-08-01T09:00:00.000Z',
};

describe('MockListingReader', () => {
  it('returns the seeded listings', async () => {
    expect(await new MockListingReader([listing]).availableListings()).toEqual([listing]);
    expect(await new MockListingReader().availableListings()).toEqual([]);
  });
});

describe('MockMembershipReader', () => {
  it("returns the actor's memberships, empty for an unknown actor", async () => {
    const membership = { tenantId: 'carrier-1', role: 'driver' as const, capabilities: ['carrier' as const] };
    const reader = new MockMembershipReader({ 'driver-1': [membership] });
    expect(await reader.membershipsFor('driver-1')).toEqual([membership]);
    expect(await reader.membershipsFor('nobody')).toEqual([]);
  });
});
