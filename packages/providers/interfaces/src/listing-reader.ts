import type { Listing } from '@mbh/domain';

// Carriers browse the public listing projection. A listing exists only while
// its load is available (postLoad writes it, acceptLoad removes it), so
// "available listings" is simply "all listings".
export interface ListingReader {
  availableListings(): Promise<Listing[]>;
}
