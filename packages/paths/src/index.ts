// The ONE source of document/collection paths. No literal Firestore-style
// path strings anywhere else in the codebase — a test pins this. Changing
// the storage layout means changing this file and nothing else.
//
// Collections:
//   tenants/{tenantId}
//   tenants/{tenantId}/members/{actorId}
//   loads/{loadId}
//   jobs/{jobId}
//   jobs/{jobId}/events/{eventId}
//   audit/{auditId}
//   requests/{requestId}          (idempotency markers — never client-readable)
//   outbox/{taskId}               (outbound work for the drain — never client-readable)
//   listings/{loadId}             (carrier-facing projection of an available load)

export const COLLECTIONS = {
  tenants: 'tenants',
  loads: 'loads',
  jobs: 'jobs',
  audit: 'audit',
  requests: 'requests',
  outbox: 'outbox',
  listings: 'listings',
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
