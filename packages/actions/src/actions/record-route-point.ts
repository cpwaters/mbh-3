import { z } from 'zod';
import { AppError, isJobTracked, type JobEvent } from '@mbh/domain';
import { jobEventDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { loadJobForDriver } from '../job-access.js';
import { zodParse } from '../parse.js';

// Breadcrumbs the laden journey (collected -> delivered) at roughly one-mile
// intervals — the client-side distance-since-last-point trigger lives in
// apps/web/src/components/useRouteTracking.ts. Modeled as an ordinary
// JobEvent: same append-only collection, same read rules as every other job
// event — no new collection, no new rules needed.
const recordRoutePointSchema = z.object({
  carrierTenantId: z.string().min(1),
  jobId: z.string().min(1),
  location: z.object({ lat: z.number().finite(), lng: z.number().finite() }),
});

export type RecordRoutePointPayload = z.infer<typeof recordRoutePointSchema>;

export interface RecordRoutePointResult extends DocData {
  jobId: string;
  // null when nothing was recorded because tracking is switched off.
  eventId: string | null;
  recorded: boolean;
}

export const recordRoutePointHandler: ActionHandler<RecordRoutePointPayload, RecordRoutePointResult> = {
  type: 'recordRoutePoint',
  idempotent: true,
  parse: zodParse(recordRoutePointSchema),
  async execute(tx, ctx, payload) {
    const job = await loadJobForDriver(tx, payload.jobId, payload.carrierTenantId, ctx.actorId);
    if (job.status !== 'collected' && job.status !== 'in_transit') {
      throw new AppError('conflict', 'Route points are only recorded during an active delivery.', {
        recoverable: false,
      });
    }

    // Tracking switched off for this job (by the founder, for its shipper,
    // carrier or driver). Accepted and dropped rather than refused: a
    // position already queued on the phone when the switch flipped must not
    // surface to the driver as a failed upload. No position is stored —
    // not on the job, and not in the audit entry either.
    if (!isJobTracked(job)) {
      return {
        result: { jobId: job.jobId, eventId: null, recorded: false },
        auditDetail: { jobId: job.jobId, recorded: false, reason: 'tracking switched off' },
      };
    }

    const eventId = ctx.newId('evt');
    const event: JobEvent = {
      eventId,
      jobId: job.jobId,
      type: 'job.routePoint',
      at: ctx.now,
      actorId: ctx.actorId,
      source: 'member',
      detail: { lat: payload.location.lat, lng: payload.location.lng },
    };
    tx.write({ kind: 'create', path: jobEventDoc(job.jobId, eventId), data: { ...event } });

    return {
      result: { jobId: job.jobId, eventId, recorded: true },
      auditDetail: { jobId: job.jobId, lat: payload.location.lat, lng: payload.location.lng },
    };
  },
};
