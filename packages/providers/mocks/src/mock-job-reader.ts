import { ACTIVE_JOB_STATUSES, isCompletedJobStatus } from '@mbh/domain';
import type { CompletedJobView, DriverJobView, JobReader } from '@mbh/provider-interfaces';

// A row the mock is seeded with: a driver's view of a job plus the owning
// driver and (for finished jobs) when it was delivered.
export type MockJob = DriverJobView & { driverActorId: string; deliveredAt?: string };

// Scriptable in-memory JobReader — the CI default. Seed it with the jobs a
// test cares about; it returns the given driver's active job and finished
// history.
export class MockJobReader implements JobReader {
  private readonly jobs: MockJob[];

  constructor(jobs: MockJob[] = []) {
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
      priceGbpPence: match.priceGbpPence,
      ...(match.route !== undefined ? { route: match.route } : {}),
    };
  }

  async completedJobsForDriver(actorId: string): Promise<CompletedJobView[]> {
    return this.jobs
      .filter((j) => j.driverActorId === actorId && isCompletedJobStatus(j.status))
      .map((j) => ({
        jobId: j.jobId,
        origin: j.origin,
        destination: j.destination,
        priceGbpPence: j.priceGbpPence,
        deliveredAt: j.deliveredAt ?? '',
        ...(j.route !== undefined ? { distanceMeters: j.route.distanceMeters } : {}),
      }))
      .sort((a, b) => (a.deliveredAt < b.deliveredAt ? 1 : -1));
  }
}
