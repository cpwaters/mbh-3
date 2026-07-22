import type { JobStatus, LoadStatus } from './entities.js';

// Legal state machines. Every status change anywhere in the system must
// pass one of these gates; anything not listed here is not a transition.

export const LOAD_TRANSITIONS: Readonly<Record<LoadStatus, readonly LoadStatus[]>> = {
  available: ['matched', 'cancelled'],
  // matched -> available is the re-listing correction path (job abandoned);
  // it is recorded as a correction, never a silent reset.
  matched: ['fulfilled', 'available'],
  cancelled: [],
  fulfilled: [],
};

export const JOB_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  accepted: ['collected'],
  collected: ['in_transit'],
  in_transit: ['delivered'],
  delivered: ['closed'],
  closed: [],
};

export function canTransitionLoad(from: LoadStatus, to: LoadStatus): boolean {
  return LOAD_TRANSITIONS[from].includes(to);
}

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to);
}

// The one-active-job-per-driver invariant counts these statuses as "active".
export const ACTIVE_JOB_STATUSES: readonly JobStatus[] = ['accepted', 'collected', 'in_transit'];

export function isActiveJobStatus(status: JobStatus): boolean {
  return ACTIVE_JOB_STATUSES.includes(status);
}
