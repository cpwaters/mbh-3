import type { Listing } from '@mbh/domain';
import type { ListingReader, Membership, MembershipReader } from '@mbh/provider-interfaces';

// Scriptable in-memory readers for the carrier browse — the CI default.

export class MockListingReader implements ListingReader {
  constructor(private readonly listings: Listing[] = []) {}
  async availableListings(): Promise<Listing[]> {
    return [...this.listings];
  }
}

export class MockMembershipReader implements MembershipReader {
  constructor(private readonly byActor: Record<string, Membership[]> = {}) {}
  async membershipsFor(actorId: string): Promise<Membership[]> {
    return [...(this.byActor[actorId] ?? [])];
  }
}
