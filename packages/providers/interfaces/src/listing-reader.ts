import type { Listing, LoadStatus } from '@mbh/domain';

// Carriers browse the public listing projection. A listing exists only while
// its load is available (postLoad writes it, acceptLoad removes it), so
// "available listings" is simply "all listings".
export interface ListingReader {
  availableListings(): Promise<Listing[]>;
}

// The shipper's read of their OWN loads (the distributor "All Loads" page),
// across all statuses.
export interface ShipperLoad {
  loadId: string;
  origin: string; // "city, postcode"
  destination: string;
  // The drain's authoritative driving distance (Load.route), converted to
  // miles. Null until the drain has enriched the load (never the shipper's
  // typed create-load estimate — that number is honest-labelled and kept
  // separate; see distributor/CreateLoad.tsx).
  distanceMiles: number | null;
  weightKg: number;
  palletCount: number;
  priceGbpPence: number;
  pickupBy: string;
  pickupTime: string;
  deliverBy: string;
  deliveryTime: string;
  status: LoadStatus;
}

export interface ShipperLoadReader {
  loadsForShipper(shipperTenantId: string): Promise<ShipperLoad[]>;
}
