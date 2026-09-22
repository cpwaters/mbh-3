import { z } from 'zod';
import { AppError, type JobEvent } from '@mbh/domain';
import { jobEventDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { loadJobForDriver } from '../job-access.js';
import { zodParse } from '../parse.js';

// A load has stopped, or is moving again. Recorded so the trail SAYS what
// happened instead of merely going quiet: "stopped since 14:10" tells a
// shipper something, an absence of breadcrumbs tells them nothing — and the
// breadcrumb trigger is distance-based, so a parked vehicle produces no
// points at all and is indistinguishable from a driver who closed the app.
//
// The detection lives in the domain (packages/domain/src/motion.ts) and runs
// on the device; only the confirmed transition is sent. Modelled as ordinary
// JobEvents, like every other thing that happens to a job — no new
// collection, no new rules.
const recordMotionSchema = z.object({
  carrierTenantId: z.string().min(1),
  jobId: z.string().min(1),
  moving: z.boolean(),
  location: z.object({ lat: z.number().finite(), lng: z.number().finite() }),
  // When the stop began, which is earlier than when it was confirmed — a
  // stop is only called once it has lasted, and dating it from the
  // confirmation would tell the shipper it started minutes after it did.
  since: z.string().min(1).optional(),
});

export type RecordMotionPayload = z.infer<typeof recordMotionSchema>;

export interface RecordMotionResult extends DocData {
  jobId: string;
  eventId: string;
}

export const recordMotionHandler: ActionHandler<RecordMotionPayload, RecordMotionResult> = {
  type: 'recordMotion',
  idempotent: true,
  parse: zodParse(recordMotionSchema),
  async execute(tx, ctx, payload) {
    const job = await loadJobForDriver(tx, payload.jobId, payload.carrierTenantId, ctx.actorId);
    if (job.status !== 'collected' && job.status !== 'in_transit') {
      throw new AppError('conflict', 'Movement is only recorded during an active delivery.', {
        recoverable: false,
      });
    }

    const eventId = ctx.newId('evt');
    const event: JobEvent = {
      eventId,
      jobId: job.jobId,
      type: payload.moving ? 'job.resumed' : 'job.stopped',
      at: ctx.now,
      actorId: ctx.actorId,
      source: 'member',
      detail: {
        lat: payload.location.lat,
        lng: payload.location.lng,
        ...(payload.since !== undefined ? { since: payload.since } : {}),
      },
    };
    tx.write({ kind: 'create', path: jobEventDoc(job.jobId, eventId), data: { ...event } });

    return {
      result: { jobId: job.jobId, eventId },
      auditDetail: { jobId: job.jobId, moving: payload.moving },
    };
  },
};
