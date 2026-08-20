// The ONE source of document/collection paths. No literal Firestore-style
// path strings anywhere else in the codebase — a test pins this. Changing
// the storage layout means changing this file and nothing else.
//
// Collections:
//   tenants/{tenantId}
//   tenants/{tenantId}/members/{actorId}
//   tenants/{tenantId}/vehicles/{vehicleId}   (a carrier's fleet)
//   tenants/{tenantId}/addressBook/{entryId} (a shipper's saved addresses)
//   loads/{loadId}
//   jobs/{jobId}
//   jobs/{jobId}/events/{eventId}
//   audit/{auditId}
//   requests/{requestId}          (idempotency markers — never client-readable)
//   outbox/{taskId}               (outbound work for the drain — never client-readable)
//   listings/{loadId}             (carrier-facing projection of an available load)
//   userProfiles/{actorId}        (a user's own account profile — keyed by uid)

export const COLLECTIONS = {
  tenants: 'tenants',
  loads: 'loads',
  jobs: 'jobs',
  audit: 'audit',
  requests: 'requests',
  outbox: 'outbox',
  listings: 'listings',
  userProfiles: 'userProfiles',
} as const;

export function tenantDoc(tenantId: string): string {
  return `${COLLECTIONS.tenants}/${tenantId}`;
}

// The leaf name of the members subcollection — also the id for a
// collection-group query (a user reading their own member docs across tenants).
export const MEMBERS_SUBCOLLECTION = 'members';

export function membersCollection(tenantId: string): string {
  return `${tenantDoc(tenantId)}/${MEMBERS_SUBCOLLECTION}`;
}

export function memberDoc(tenantId: string, actorId: string): string {
  return `${membersCollection(tenantId)}/${actorId}`;
}

// A carrier's fleet lives under the owning tenant, so reads are gated by
// membership of that tenant (no field-alignment needed).
export const VEHICLES_SUBCOLLECTION = 'vehicles';

export function vehiclesCollection(tenantId: string): string {
  return `${tenantDoc(tenantId)}/${VEHICLES_SUBCOLLECTION}`;
}

export function vehicleDoc(tenantId: string, vehicleId: string): string {
  return `${vehiclesCollection(tenantId)}/${vehicleId}`;
}

// A shipper's saved addresses live under the owning tenant, so reads are
// gated by membership of that tenant (same shape as the fleet above).
export const ADDRESS_BOOK_SUBCOLLECTION = 'addressBook';

export function addressBookCollection(tenantId: string): string {
  return `${tenantDoc(tenantId)}/${ADDRESS_BOOK_SUBCOLLECTION}`;
}

export function addressBookEntryDoc(tenantId: string, entryId: string): string {
  return `${addressBookCollection(tenantId)}/${entryId}`;
}

export function loadsCollection(): string {
  return COLLECTIONS.loads;
}

export function loadDoc(loadId: string): string {
  return `${COLLECTIONS.loads}/${loadId}`;
}

export function jobsCollection(): string {
  return COLLECTIONS.jobs;
}

export function jobDoc(jobId: string): string {
  return `${COLLECTIONS.jobs}/${jobId}`;
}

export function jobEventsCollection(jobId: string): string {
  return `${jobDoc(jobId)}/events`;
}

export function jobEventDoc(jobId: string, eventId: string): string {
  return `${jobEventsCollection(jobId)}/${eventId}`;
}

export function jobEvidenceCollection(jobId: string): string {
  return `${jobDoc(jobId)}/evidence`;
}

export function jobEvidenceDoc(jobId: string, evidenceId: string): string {
  return `${jobEvidenceCollection(jobId)}/${evidenceId}`;
}

export function auditDoc(auditId: string): string {
  return `${COLLECTIONS.audit}/${auditId}`;
}

export function requestMarkerDoc(requestId: string): string {
  return `${COLLECTIONS.requests}/${requestId}`;
}

export function outboxCollection(): string {
  return COLLECTIONS.outbox;
}

export function outboxTaskDoc(taskId: string): string {
  return `${COLLECTIONS.outbox}/${taskId}`;
}

export function listingsCollection(): string {
  return COLLECTIONS.listings;
}

// One listing per load — same id, so the projection is trivially found and
// removed when the load is taken.
export function listingDoc(loadId: string): string {
  return `${COLLECTIONS.listings}/${loadId}`;
}

export function userProfilesCollection(): string {
  return COLLECTIONS.userProfiles;
}

// One profile per user, keyed by their actorId (auth uid).
export function userProfileDoc(actorId: string): string {
  return `${COLLECTIONS.userProfiles}/${actorId}`;
}

// Invitations to the marketplace. Top-level: an invite exists before the
// company it creates, so it cannot live under a tenant. The doc id is the
// secret in the link.
const INVITES_COLLECTION = 'invites';

export function invitesCollection(): string {
  return INVITES_COLLECTION;
}

export function inviteDoc(inviteId: string): string {
  return `${INVITES_COLLECTION}/${inviteId}`;
}
