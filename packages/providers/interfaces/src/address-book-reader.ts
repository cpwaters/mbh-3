import type { AddressBookEntry } from '@mbh/domain';

// A shipper's saved collection/delivery points, offered in the create-load
// form. Active entries only — archived ones stay readable in the store (they
// are never deleted) but are deliberately not offered for picking.
export interface AddressBookReader {
  addressBookForTenant(shipperTenantId: string): Promise<AddressBookEntry[]>;
}
