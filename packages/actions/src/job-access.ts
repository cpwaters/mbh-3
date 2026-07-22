import { AppError, canTransitionJob, type Job, type JobStatus, type Role } from '@mbh/domain';
import { jobDoc } from '@mbh/paths';
import type { TransactionContext } from '@mbh/provider-interfaces';
import { requireMember } from './require-member.js';

// Roles on the carrier side that may progress a job.
export const CARRIER_JOB_ROLES: readonly Role[] = ['owner', 'driver'];

// Loads a job and authorizes the actor as its driver on the stated carrier
// tenant. Used by every job-progression action so the checks are identical.
export async function loadJobForDriver(
  tx: TransactionContext,
  jobId: string,
  carrierTenantId: string,
  actorId: string
): Promise<Job> {
  await requireMember(tx, carrierTenantId, actorId, CARRIER_JOB_ROLES);

  const data = await tx.get(jobDoc(jobId));
  if (data === null) {
    throw new AppError('not-found', 'That job no longer exists.');
  }
  const job = data as unknown as Job;
  if (job.carrierTenantId !== carrierTenantId || job.driverActorId !== actorId) {
    // Don't leak existence of jobs the actor has no part in.
    throw new AppError('forbidden', 'This is not your job.');
  }
  return job;
}

// Guards a job status transition, throwing a structured conflict otherwise.
export function guardJobTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransitionJob(from, to)) {
    throw new AppError('conflict', `A job cannot move from ${from} to ${to}.`, { recoverable: false });
  }
}
