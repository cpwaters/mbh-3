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

export const COLLECTIONS = {
  tenants: 'tenants',
  loads: 'loads',
  jobs: 'jobs',
  audit: 'audit',
  requests: 'requests',
} as const;

export function tenantDoc(tenantId: string): string {
  return `${COLLECTIONS.tenants}/${tenantId}`;
}

export function membersCollection(tenantId: string): string {
  return `${tenantDoc(tenantId)}/members`;
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

export function auditDoc(auditId: string): string {
  return `${COLLECTIONS.audit}/${auditId}`;
}

export function requestMarkerDoc(requestId: string): string {
  return `${COLLECTIONS.requests}/${requestId}`;
}
