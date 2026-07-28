import type { Listing } from '@mbh/domain';
import type {
  ListingReader,
  Membership,
  MembershipReader,
  ShipperLoad,
  ShipperLoadReader,
} from '@mbh/provider-interfaces';

// Scriptable in-memory readers for the carrier browse — the CI default.

export class MockListingReader implements ListingReader {
  constructor(private readonly listings: Listing[] = []) {}
  async availableListings(): Promise<Listing[]> {
    return [...this.listings];
  }
}

export class MockShipperLoadReader implements ShipperLoadReader {
  constructor(private readonly byTenant: Record<string, ShipperLoad[]> = {}) {}
  async loadsForShipper(shipperTenantId: string): Promise<ShipperLoad[]> {
    return [...(this.byTenant[shipperTenantId] ?? [])];
  }
}

export class MockMembershipReader implements MembershipReader {
  constructor(private readonly byActor: Record<string, Membership[]> = {}) {}
  async membershipsFor(actorId: string): Promise<Membership[]> {
    return [...(this.byActor[actorId] ?? [])];
  }
}
