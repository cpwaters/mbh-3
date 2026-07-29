import { z } from 'zod';
import {
  AppError,
  canTransitionLoad,
  isActiveJobStatus,
  listingFromLoad,
  type JobEvent,
  type Load,
} from '@mbh/domain';
import { jobDoc, jobEventDoc, listingDoc, loadDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { loadJobForDriver } from '../job-access.js';
import { zodParse } from '../parse.js';

// Return an active job's load to the available pool. The job is dropped and the
// load goes matched -> available (the domain's "job abandoned" re-listing path),
// with its carrier browse projection re-created so it shows up in Available
// Loads again. Exposed in the UI as a founder-only "Complete" reset.

const relistJobSchema = z.object({
  carrierTenantId: z.string().min(1),
  jobId: z.string().min(1),
});

export type RelistJobPayload = z.infer<typeof relistJobSchema>;

export interface RelistJobResult extends DocData {
  loadId: string;
}

export const relistJobHandler: ActionHandler<RelistJobPayload, RelistJobResult> = {
  type: 'relistJob',
  idempotent: true, // replay by requestId is deduped server-side
  parse: zodParse(relistJobSchema),
  async execute(tx, ctx, payload) {
    const job = await loadJobForDriver(tx, payload.jobId, payload.carrierTenantId, ctx.actorId);
    if (!isActiveJobStatus(job.status)) {
      throw new AppError('conflict', 'Only an active job can be returned to the available loads.', {
        recoverable: false,
      });
    }

    const loadData = await tx.get(loadDoc(job.loadId));
    if (loadData === null) {
      throw new AppError('not-found', 'That load no longer exists.');
    }
    const load = loadData as unknown as Load;
    if (!canTransitionLoad(load.status, 'available')) {
      throw new AppError('conflict', `A load cannot move from ${load.status} to available.`, {
        recoverable: false,
      });
    }
    const relisted: Load = { ...load, status: 'available' };

    // Load back to available + re-create the carrier browse projection (accept
    // had deleted it) + drop the job, all in one batch.
    tx.write({ kind: 'update', path: loadDoc(load.loadId), data: { status: 'available' } });
    tx.write({ kind: 'create', path: listingDoc(load.loadId), data: { ...listingFromLoad(relisted) } });
    tx.write({ kind: 'delete', path: jobDoc(job.jobId) });

    const eventId = ctx.newId('evt');
    const event: JobEvent = {
      eventId,
      jobId: job.jobId,
      type: 'job.relisted',
      at: ctx.now,
      actorId: ctx.actorId,
      source: 'member',
      detail: { loadId: load.loadId },
    };
    tx.write({ kind: 'create', path: jobEventDoc(job.jobId, eventId), data: { ...event } });

    return { result: { loadId: load.loadId }, auditDetail: { jobId: job.jobId, loadId: load.loadId } };
  },
};
