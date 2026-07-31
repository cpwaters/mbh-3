// Domain entities. Zero dependencies — no vendor SDKs, no framework code,
// no browser APIs. Timestamps are ISO-8601 UTC strings; money is integer
// GBP pence. Every tenant-scoped document carries a denormalized tenantId.

import type { LoadRoute } from './geo.js';

export type TenantCapability = 'shipper' | 'carrier';

export interface Tenant {
  tenantId: string;
  name: string;
  capabilities: TenantCapability[];
  createdAt: string;
}

export type Role = 'owner' | 'dispatcher' | 'driver';
export type MemberStatus = 'active' | 'disabled';

// Members are disabled, never deleted — audit attribution must survive.
export interface Member {
  tenantId: string;
  actorId: string;
  displayName: string;
  role: Role;
  status: MemberStatus;
  createdAt: string;
}

export interface Address {
  line1: string;
  town: string;
  postcode: string;
}

export interface ConsignmentDetails {
  description: string;
  weightKg: number;
  palletCount: number;
}

// A Load is the shipper's listing. It is matched at most once; the
// operational life of the work after acceptance lives on the Job.
export type LoadStatus = 'available' | 'matched' | 'cancelled' | 'fulfilled';

// Extra distributor-supplied metadata from the create-load form, kept so the
// shipper's loads round-trip faithfully. Optional — the marketplace core is
// origin/destination/consignment/price/dates on the Load itself.
export interface LoadPostingDetails {
  sourceCompanyName: string;
  destinationCompanyName: string;
  sourceContact: ProfileContact;
  destinationContact: ProfileContact;
  pickupTime: string;
  deliveryTime: string;
  distanceMiles: number;
  volumeM3: number;
  specialInstructions: string;
  vehicleSizes: string[]; // van / rigid / artic
  vehicleTypes: string[]; // refrigerated / box / flat_bed / ...
  paymentType: ProfilePaymentType;
}

export interface Load {
  loadId: string;
  tenantId: string; // the shipper tenant that owns the listing
  status: LoadStatus;
  origin: Address;
  destination: Address;
  consignment: ConsignmentDetails;
  priceGbpPence: number;
  pickupBy: string;
  deliverBy: string;
  createdAt: string;
  // Distributor create-load metadata (optional).
  postingDetails?: LoadPostingDetails;
  // System-written enrichment (geocode + driving route), absent until the
  // drain has processed this load. Never user-supplied.
  route?: LoadRoute;
}

// A Job is the cross-tenant record created by acceptance — the shared,
// append-only object both parties can read, where evidence and status live.
export type JobStatus = 'accepted' | 'collected' | 'in_transit' | 'delivered' | 'closed';

export interface Job {
  jobId: string;
  loadId: string;
  shipperTenantId: string;
  carrierTenantId: string;
  driverActorId: string;
  status: JobStatus;
  createdAt: string;
  // Delivery details denormalized from the load at acceptance — the carrier is
  // entitled to them now (they must collect and deliver), and they let the
  // driver's home render without reading the shipper-private load. `route` is
  // present only if the drain had enriched the load by acceptance time.
  origin: Address;
  destination: Address;
  // Collection/delivery company names, denormalized from the load's posting
  // details at acceptance so the driver sees who they're collecting from and
  // delivering to — without reading the shipper-private load. Absent if the
  // load carried no posting details.
  originCompanyName?: string;
  destinationCompanyName?: string;
  // The carrier's pay for the job, denormalized from the load at acceptance so
  // it is fixed at the price agreed and the driver's earnings read never needs
  // the shipper-private load.
  priceGbpPence: number;
  route?: LoadRoute;
  // Set when the job transitions to `delivered` — the timestamp earnings are
  // bucketed by. Absent until then.
  deliveredAt?: string;
}

// A user's own account profile — cross-tenant identity they control, keyed by
// actorId (the auth uid). Mirrors the mbh-2 prototype's rich driver profile.
export interface ProfileAddress {
  street: string;
  town: string;
  city: string;
  postcode: string;
}

export interface ProfileContact {
  name: string;
  email: string;
  phone: string;
}

export interface ProfilePaymentType {
  invoiced: boolean;
  instantPayment: boolean;
}

export interface UserProfile {
  actorId: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  companyName: string;
  companyRegistrationNumber: string;
  companyAddress: ProfileAddress;
  companyContact: ProfileContact;
  vatNumber: string;
  drivingLicenseNumber: string;
  quantityOfVehicles: number;
  paymentType: ProfilePaymentType;
  rating: number; // system-assigned; never user-editable
  image: string; // profile image URL
  displayName: string; // `${firstName} ${lastName}`, kept for the nav + onboarding
  updatedAt: string;
}

// A Vehicle is a carrier's fleet asset, held under the owning carrier tenant.
// Retired, never deleted — fleet history must survive. Fields mirror mbh-2.
export type VehicleType = 'van' | 'unit' | 'trailer' | 'rigid';
export type VehicleConfiguration =
  | 'refrigerated'
  | 'flatbed'
  | 'tanker'
  | 'curtain sider'
  | 'box'
  | 'skeleton';
export type VehicleStatus = 'active' | 'retired';

export interface Vehicle {
  vehicleId: string;
  tenantId: string; // the carrier tenant that owns the vehicle
  registration: string; // UK number plate, normalized (uppercase, single-spaced)
  make: string;
  model: string;
  year: number;
  vin: string; // may be empty
  vehicleType: VehicleType;
  vehicleConfiguration: VehicleConfiguration;
  status: VehicleStatus;
  createdAt: string;
  createdBy: string; // the actorId that added it
}

export type EventSource = 'member' | 'system';

// JobEvents are append-only. Corrections are new events that name what they
// correct — never edits of prior events.
export interface JobEvent {
  eventId: string;
  jobId: string;
  type: string;
  at: string;
  actorId: string;
  source: EventSource;
  detail?: Record<string, unknown>;
}
