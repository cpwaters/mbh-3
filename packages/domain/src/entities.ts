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
  // The carrier's pay for the job, denormalized from the load at acceptance so
  // it is fixed at the price agreed and the driver's earnings read never needs
  // the shipper-private load.
  priceGbpPence: number;
  route?: LoadRoute;
  // Set when the job transitions to `delivered` — the timestamp earnings are
  // bucketed by. Absent until then.
  deliveredAt?: string;
}

// A user's own account profile — cross-tenant identity they control. Distinct
// from their per-tenant Member.displayName (how they appear inside a company).
// Keyed by actorId (the auth uid).
export interface UserProfile {
  actorId: string;
  displayName: string;
  phone: string; // optional contact number; may be empty
  updatedAt: string;
}

// A Vehicle is a carrier's fleet asset, held under the owning carrier tenant.
// Retired, never deleted — fleet history must survive.
export type VehicleType = 'van' | 'rigid' | 'artic';
export type VehicleStatus = 'active' | 'retired';

export interface Vehicle {
  vehicleId: string;
  tenantId: string; // the carrier tenant that owns the vehicle
  registration: string; // UK number plate, normalized (uppercase, single-spaced)
  type: VehicleType;
  capacityKg: number;
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
