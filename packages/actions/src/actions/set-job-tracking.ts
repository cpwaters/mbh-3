import { z } from 'zod';
import { AppError, type JobEvent } from '@mbh/domain';
import { jobEventDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { loadJobForDriver } from '../job-access.js';
import { zodParse } from '../parse.js';

// The driver turning location recording off, and on again.
//
// This is the consent mechanism, and it only means anything if the record
// says it happened. A silent gap in the trail is indistinguishable from lost
// signal or a closed app, so pausing writes an EVENT: the shipper sees that
// the driver paused and when, rather than watching a dot stop moving and
// drawing their own conclusions. Recorded honestly, a pause is better
// evidence than a hole.
//
// It pauses the recording of POSITION only. The job's own status, its
// evidence and the delivery capture are untouched — the driver is still
// doing the job, they have just asked not to be followed while they are out
// of the cab.
const setJobTrackingSchema = z.object({
  carrierTenantId: z.string().min(1),
  jobId: z.string().min(1),
  paused: z.boolean(),
});

export type SetJobTrackingPayload = z.infer<typeof setJobTrackingSchema>;

export interface SetJobTrackingResult extends DocData {
  jobId: string;
  eventId: string;
}

export const setJobTrackingHandler: ActionHandler<SetJobTrackingPayload, SetJobTrackingResult> = {
  type: 'setJobTracking',
  idempotent: true,
  parse: zodParse(setJobTrackingSchema),
  async execute(tx, ctx, payload) {
    // Only the driver carrying it may pause it — a dispatcher cannot switch
    // off the record of someone else's journey.
    const job = await loadJobForDriver(tx, payload.jobId, payload.carrierTenantId, ctx.actorId);
    if (job.status !== 'collected' && job.status !== 'in_transit') {
      throw new AppError('conflict', 'Tracking can only be paused during an active delivery.', {
        recoverable: false,
      });
    }

    const eventId = ctx.newId('evt');
    const event: JobEvent = {
      eventId,
      jobId: job.jobId,
      type: payload.paused ? 'job.trackingPaused' : 'job.trackingResumed',
      at: ctx.now,
      actorId: ctx.actorId,
      source: 'member',
    };
    tx.write({ kind: 'create', path: jobEventDoc(job.jobId, eventId), data: { ...event } });

    return {
      result: { jobId: job.jobId, eventId },
      auditDetail: { jobId: job.jobId, paused: payload.paused },
    };
  },
};
