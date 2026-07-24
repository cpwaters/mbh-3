import { ACTIVE_JOB_STATUSES } from '@mbh/domain';
import type { DriverJobView, JobReader } from '@mbh/provider-interfaces';

// Scriptable in-memory JobReader — the CI default. Seed it with the jobs a
// test cares about; it returns the given driver's first non-terminal job.
export class MockJobReader implements JobReader {
  private readonly jobs: Array<DriverJobView & { driverActorId: string }>;

  constructor(jobs: Array<DriverJobView & { driverActorId: string }> = []) {
    this.jobs = jobs;
  }

  async activeJobForDriver(actorId: string): Promise<DriverJobView | null> {
    const match = this.jobs.find(
      (j) => j.driverActorId === actorId && (ACTIVE_JOB_STATUSES as readonly string[]).includes(j.status)
    );
    if (match === undefined) return null;
    return {
      jobId: match.jobId,
      carrierTenantId: match.carrierTenantId,
      status: match.status,
      origin: match.origin,
      destination: match.destination,
      ...(match.route !== undefined ? { route: match.route } : {}),
    };
  }
}
