import type { JobStatus } from '@mbh/domain';

// Where a load actually is, for the shipper who posted it.
//
// Distinct from JobReader, which is the DRIVER's read of their own work. This
// is the other side of the same record: the shipper following a load they no
// longer control. Both are rules-gated client reads against the store, never
// through the write path.

export interface TrailPoint {
  lat: number;
  lng: number;
  at: string; // ISO-8601 UTC — when the driver's device recorded this fix
}

export interface JobTrail {
  jobId: string;
  status: JobStatus;
  // Oldest first, so it draws as a path.
  points: TrailPoint[];
  // When the most recent point was recorded, or null when there are none yet.
  // The UI shows this rather than implying the last point is live: a driver
  // out of signal, or with the app closed, leaves a position that is true but
  // old, and presenting it as current is worse than saying nothing.
  lastSeenAt: string | null;
}

export interface JobTrailReader {
  // The trail for the job created from this load, or null when the load has
  // not been accepted yet (no job exists).
  //
  // The owning tenant is a parameter and not an inference: the rules refuse a
  // `jobs` query filtered by loadId alone — ownership has to be provable from
  // the query itself, not from the document it returns — so the read is
  // constrained by shipperTenantId and narrowed to the load afterwards. A
  // rules test pins both halves of that.
  trailForLoad(loadId: string, shipperTenantId: string): Promise<JobTrail | null>;
}
