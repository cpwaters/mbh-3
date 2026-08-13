import { describe, expect, it } from 'vitest';
import type { AddressBookEntry } from '@mbh/domain';
import { MockAddressBookReader } from './mock-address-book-reader.js';

function entry(overrides: Partial<AddressBookEntry> = {}): AddressBookEntry {
  return {
    entryId: 'addr-1',
    tenantId: 'shipper-1',
    label: 'Tesco Trafford DC',
    companyName: 'Tesco Distribution',
    line1: '10 Distribution Way',
    town: 'Trafford',
    postcode: 'M17 1WS',
    contactName: 'John Smith',
    contactEmail: 'john@tesco.test',
    contactPhone: '0161 234 5678',
    status: 'active',
    createdAt: '2026-08-13T09:00:00.000Z',
    createdBy: 'ship-owner',
    updatedAt: '2026-08-13T09:00:00.000Z',
    ...overrides,
  };
}

describe('MockAddressBookReader', () => {
  it("returns the tenant's active entries alphabetically by label", async () => {
    const reader = new MockAddressBookReader([
      entry({ entryId: 'addr-2', label: 'Zebra Depot' }),
      entry({ entryId: 'addr-1', label: 'Asda Leith' }),
      entry({ entryId: 'addr-3', label: 'Morrisons Hull' }),
    ]);
    expect((await reader.addressBookForTenant('shipper-1')).map((e) => e.label)).toEqual([
      'Asda Leith',
      'Morrisons Hull',
      'Zebra Depot',
    ]);
  });

  it('omits archived entries and other tenants entries', async () => {
    const reader = new MockAddressBookReader([
      entry({ entryId: 'addr-1', label: 'Active' }),
      entry({ entryId: 'addr-2', label: 'Archived', status: 'archived' }),
      entry({ entryId: 'addr-3', label: 'Someone else', tenantId: 'shipper-2' }),
    ]);
    expect((await reader.addressBookForTenant('shipper-1')).map((e) => e.label)).toEqual(['Active']);
  });

  it('returns empty for a tenant with no saved addresses', async () => {
    expect(await new MockAddressBookReader().addressBookForTenant('shipper-1')).toEqual([]);
  });
});
