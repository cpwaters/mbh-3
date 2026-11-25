import type { Load } from './entities.js';

// What the shipper ticks under Vehicle Requirements on Create Load, as the
// trade says it. Unknown values (from an older form) fall back to themselves.
export const LOAD_VEHICLE_SIZE_LABELS: Readonly<Record<string, string>> = {
  van: 'Van',
  rigid: 'Rigid',
  artic: 'Artic',
};

export const LOAD_VEHICLE_TYPE_LABELS: Readonly<Record<string, string>> = {
  refrigerated: 'Refrigerated',
  box: 'Box',
  flat_bed: 'Flat Bed',
  low_loader: 'Low Loader',
  skeleton: 'Skeleton',
  tanker: 'Tanker',
};

export const LOAD_VEHICLE_TYPES: readonly string[] = Object.keys(LOAD_VEHICLE_TYPE_LABELS);

// The carrier's vehicle-type filter. A load stays in view when it accepts one
// of the types picked; a load that asks for no particular type (none ticked,
// or a listing from before the field) takes any vehicle, so it always stays.
// Nothing picked means no filter.
export function matchesVehicleTypes(loadTypes: readonly string[] | undefined, picked: readonly string[]): boolean {
  if (picked.length === 0) return true;
  if (loadTypes === undefined || loadTypes.length === 0) return true;
  return loadTypes.some((t) => picked.includes(t));
}

// "Artic, Rigid" — or "Any" when the shipper ticked none, which is what
// leaving them all blank means. Null when the load never said (a listing made
// before the field existed), so a screen can leave the line out.
export function describeLoadVehicles(
  values: readonly string[] | undefined,
  labels: Readonly<Record<string, string>>
): string | null {
  if (values === undefined) return null;
  if (values.length === 0) return 'Any';
  return values.map((v) => labels[v] ?? v).join(', ');
}
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
  // What the shipper needs to carry it: size (van / rigid / artic) and type
  // (refrigerated / box / flat_bed / ...), as ticked on Create Load. Empty
  // means any. Absent on listings made before the fields existed.
  vehicleSizes?: string[];
  vehicleTypes?: string[];
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
    vehicleSizes: [...(load.postingDetails?.vehicleSizes ?? [])],
    vehicleTypes: [...(load.postingDetails?.vehicleTypes ?? [])],
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
