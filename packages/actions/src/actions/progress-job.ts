import { z } from 'zod';
import type { JobEvent } from '@mbh/domain';
import { jobDoc, jobEventDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { guardJobTransition, loadJobForDriver } from '../job-access.js';
import { zodParse } from '../parse.js';

// The plain job-progression steps: collect (accepted -> collected) and
// start transit (collected -> in_transit). Each writes the status change and
// its append-only event in one batch. Delivery is separate (deliverJob) —
// it carries the PoD evidence.

const progressSchema = z.object({
  carrierTenantId: z.string().min(1),
  jobId: z.string().min(1),
});

type ProgressPayload = z.infer<typeof progressSchema>;

interface ProgressResult extends DocData {
  jobId: string;
  status: string;
}

function makeProgressHandler(
  type: string,
  to: 'collected' | 'in_transit',
  eventType: string
): ActionHandler<ProgressPayload, ProgressResult> {
  return {
    type,
    idempotent: true,
    parse: zodParse(progressSchema),
    async execute(tx, ctx, payload) {
      const job = await loadJobForDriver(tx, payload.jobId, payload.carrierTenantId, ctx.actorId);
      guardJobTransition(job.status, to);

      const eventId = ctx.newId('evt');
      const event: JobEvent = {
        eventId,
        jobId: job.jobId,
        type: eventType,
        at: ctx.now,
        actorId: ctx.actorId,
        source: 'member',
      };

      tx.write({ kind: 'update', path: jobDoc(job.jobId), data: { status: to } });
      tx.write({ kind: 'create', path: jobEventDoc(job.jobId, eventId), data: { ...event } });

      return { result: { jobId: job.jobId, status: to }, auditDetail: { jobId: job.jobId, status: to } };
    },
  };
}

export const collectJobHandler = makeProgressHandler('collectJob', 'collected', 'job.collected');
export const startTransitHandler = makeProgressHandler('startTransit', 'in_transit', 'job.in_transit');
