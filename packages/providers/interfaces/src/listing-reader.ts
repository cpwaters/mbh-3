import type { Address, LoadStatus, Listing, ProfileContact } from '@mbh/domain';

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
  // The full origin/destination addresses + posting contact details, kept
  // alongside the display strings above so a fulfilled load's addresses can
  // be carried into a fresh Create Load form ("reuse this load" — see
  // distributor/LoadsList.tsx / CreateLoad.tsx). Contact fields fall back to
  // an empty ProfileContact when the load carries no postingDetails.
  originAddress: Address;
  destinationAddress: Address;
  sourceCompanyName: string;
  destinationCompanyName: string;
  sourceContact: ProfileContact;
  destinationContact: ProfileContact;
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
