import type { Load } from './entities.js';
import type { GeoPoint, RouteInfo } from './geo.js';

// The carrier-facing projection of a Load (ADR-0002). Raw loads are
// shipper-private; this is the deliberately-narrow, safe-to-expose view
// carriers browse. It carries the route, the goods summary, the window, and
// the headline price — never the shipper's precise street address or any
// private commercial detail. One listing per available load (same id).

export interface ListingEndpoint {
  town: string;
  postcode: string;
}

export interface Listing {
  loadId: string;
  shipperTenantId: string;
  origin: ListingEndpoint;
  destination: ListingEndpoint;
  description: string;
  weightKg: number;
  palletCount: number;
  // Dangerous goods — shown up front, because a carrier without an ADR-trained
  // driver cannot take the load at all. Absent on listings made before the
  // field existed, which means not ADR.
  adrRequired?: boolean;
  priceGbpPence: number;
  pickupBy: string;
  deliverBy: string;
  postedAt: string;
  // Filled by the drain once it has geocoded + routed the load.
  route?: RouteInfo;
  // Where the collection postcode is — the postcode's centre, so no more
  // precise than the postcode the listing already shows. Filled by the drain
  // with the route; it is what plots the load on a driver's map.
  collectionPoint?: GeoPoint;
}

// The ONE place a Load becomes its public projection. Note the omissions:
// origin/destination expose town + postcode only (never line1), and no
// shipper contact/commercial internals are copied.
export function listingFromLoad(load: Load): Listing {
  return {
    loadId: load.loadId,
    shipperTenantId: load.tenantId,
    origin: { town: load.origin.town, postcode: load.origin.postcode },
    destination: { town: load.destination.town, postcode: load.destination.postcode },
    description: load.consignment.description,
    weightKg: load.consignment.weightKg,
    palletCount: load.consignment.palletCount,
    adrRequired: load.consignment.adrRequired === true,
    priceGbpPence: load.priceGbpPence,
    pickupBy: load.pickupBy,
    deliverBy: load.deliverBy,
    postedAt: load.createdAt,
    ...(load.route !== undefined
      ? {
          route: { distanceMeters: load.route.distanceMeters, durationSeconds: load.route.durationSeconds },
          collectionPoint: { lat: load.route.origin.lat, lng: load.route.origin.lng },
        }
      : {}),
  };
}
