import type { Address, JobStatus, LoadRoute } from '@mbh/domain';

// The driver's read of their own current work. Business reads happen directly
// against the store (rules-gated), never through the write path — so this is a
// client-side READ interface, distinct from the DataStore the server uses.

export interface DriverJobView {
  jobId: string;
  carrierTenantId: string;
  status: JobStatus;
  origin: Address;
  destination: Address;
  priceGbpPence: number;
  route?: LoadRoute;
}

// A finished job the driver earned on — the row the earnings summary sums and
// lists. Ordered newest-delivered-first by the reader.
export interface CompletedJobView {
  jobId: string;
  origin: Address;
  destination: Address;
  priceGbpPence: number;
  deliveredAt: string;
}

export interface JobReader {
  // The driver's current non-terminal job (accepted/collected/in_transit), or
  // null when they have none.
  activeJobForDriver(actorId: string): Promise<DriverJobView | null>;
  // The driver's finished jobs (delivered/closed), newest first — the earnings
  // history.
  completedJobsForDriver(actorId: string): Promise<CompletedJobView[]>;
}
