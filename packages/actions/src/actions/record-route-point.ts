import { z } from 'zod';
import { AppError, type JobEvent } from '@mbh/domain';
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
  eventId: string;
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
      result: { jobId: job.jobId, eventId },
      auditDetail: { jobId: job.jobId, lat: payload.location.lat, lng: payload.location.lng },
    };
  },
};
