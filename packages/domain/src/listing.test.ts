import { describe, expect, it } from 'vitest';
import { listingFromLoad } from './listing.js';
import type { Load } from './entities.js';

const load: Load = {
  loadId: 'load-1',
  tenantId: 'shipper-1',
  status: 'available',
  origin: { line1: '10 Distribution Way', town: 'Trafford', postcode: 'M17 1WS' },
  destination: { line1: '5 Harbour Road', town: 'Leith', postcode: 'EH6 6JJ' },
  consignment: { description: 'Mixed pallets', weightKg: 14200, palletCount: 16 },
  priceGbpPence: 68000,
  pickupBy: '2026-08-02',
  deliverBy: '2026-08-03',
  createdAt: '2026-08-01T09:00:00.000Z',
};

describe('listingFromLoad', () => {
  it('projects the safe, carrier-facing fields', () => {
    expect(listingFromLoad(load)).toEqual({
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
    });
  });

  it('never exposes the precise street address (line1)', () => {
    const json = JSON.stringify(listingFromLoad(load));
    expect(json).not.toContain('Distribution Way');
    expect(json).not.toContain('Harbour Road');
  });
});
