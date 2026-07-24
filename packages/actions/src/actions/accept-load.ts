import { z } from 'zod';
import {
  AppError,
  canTransitionLoad,
  isActiveJobStatus,
  type Job,
  type JobEvent,
  type JobStatus,
  type Load,
  type LoadStatus,
  type Role,
} from '@mbh/domain';
import { jobDoc, jobEventDoc, jobsCollection, listingDoc, loadDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireMember } from '../require-member.js';
import { zodParse } from '../parse.js';

// Carriers accept loads. Roles allowed to accept.
const ACCEPT_ROLES: readonly Role[] = ['owner', 'driver'];

const acceptLoadSchema = z.object({
  carrierTenantId: z.string().min(1),
  loadId: z.string().min(1),
});

export type AcceptLoadPayload = z.infer<typeof acceptLoadSchema>;

export interface AcceptLoadResult extends DocData {
  jobId: string;
}

// The atomic acceptance: CAS the load available -> matched, create the
// cross-tenant Job + its first append-only event, all in one transaction.
// Enforces one-active-job-per-driver from committed state inside the tx.
export const acceptLoadHandler: ActionHandler<AcceptLoadPayload, AcceptLoadResult> = {
  type: 'acceptLoad',
  idempotent: true,
  parse: zodParse(acceptLoadSchema),
  async execute(tx, ctx, payload) {
    await requireMember(tx, payload.carrierTenantId, ctx.actorId, ACCEPT_ROLES);

    const loadData = await tx.get(loadDoc(payload.loadId));
    if (loadData === null) {
      throw new AppError('not-found', 'That load no longer exists.');
    }
    const load = loadData as unknown as Load;
    if (load.status !== ('available' satisfies LoadStatus) || !canTransitionLoad(load.status, 'matched')) {
      throw new AppError('conflict', 'That load has already been taken.', { recoverable: false });
    }

    // One active job per driver — checked against committed state in the tx.
    const existingJobs = await tx.query({
      collection: jobsCollection(),
      filters: [{ field: 'driverActorId', op: '==', value: ctx.actorId }],
    });
    const hasActive = existingJobs.some((row) => isActiveJobStatus(row.data.status as JobStatus));
    if (hasActive) {
      throw new AppError('conflict', 'Complete your current job before accepting another.', {
        recoverable: false,
      });
    }

    const jobId = ctx.newId('job');
    const job: Job = {
      jobId,
      loadId: load.loadId,
      shipperTenantId: load.tenantId,
      carrierTenantId: payload.carrierTenantId,
      driverActorId: ctx.actorId,
      status: 'accepted',
      createdAt: ctx.now,
      // Denormalize the delivery details so the driver's home renders without
      // reading the shipper-private load.
      origin: load.origin,
      destination: load.destination,
      ...(load.route !== undefined ? { route: load.route } : {}),
    };
    const eventId = ctx.newId('evt');
    const event: JobEvent = {
      eventId,
      jobId,
      type: 'job.accepted',
      at: ctx.now,
      actorId: ctx.actorId,
      source: 'member',
    };

    tx.write({ kind: 'update', path: loadDoc(load.loadId), data: { status: 'matched' } });
    // The load is taken — remove it from the carrier browse projection.
    tx.write({ kind: 'delete', path: listingDoc(load.loadId) });
    tx.write({ kind: 'create', path: jobDoc(jobId), data: { ...job } });
    tx.write({ kind: 'create', path: jobEventDoc(jobId, eventId), data: { ...event } });

    return {
      result: { jobId },
      auditDetail: { jobId, loadId: load.loadId, carrierTenantId: payload.carrierTenantId },
    };
  },
};
