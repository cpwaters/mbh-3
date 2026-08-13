import type { AddressBookEntry } from '@mbh/domain';
import type { AddressBookReader } from '@mbh/provider-interfaces';

// Scriptable in-memory AddressBookReader — the CI default. Returns a
// tenant's active entries, alphabetical by label (the order they are offered
// in the create-load picker, where a shipper scans for a name).
export class MockAddressBookReader implements AddressBookReader {
  constructor(private readonly entries: AddressBookEntry[] = []) {}

  async addressBookForTenant(shipperTenantId: string): Promise<AddressBookEntry[]> {
    return this.entries
      .filter((e) => e.tenantId === shipperTenantId && e.status === 'active')
      .sort((a, b) => a.label.localeCompare(b.label));
  }
}
