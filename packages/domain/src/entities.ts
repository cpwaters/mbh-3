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
  route?: LoadRoute;
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
