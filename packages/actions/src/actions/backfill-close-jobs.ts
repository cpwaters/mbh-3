import { z } from 'zod';
import type { Job, OutboxTask } from '@mbh/domain';
import { jobsCollection, outboxTaskDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireMember } from '../require-member.js';
import { zodParse } from '../parse.js';

// A one-off repair tool: closeJob is enqueued by deliverJob going forward,
// but any job that reached 'delivered' BEFORE that existed has no such task
// and is stuck there forever (its load stuck at 'matched', never reusable).
// Finds the tenant's own jobs still sitting at 'delivered' — on either side,
// shipper or carrier — and enqueues a closeJob task for each, so the next
// drain tick closes them through the exact same tested path as a fresh
// delivery. Naturally safe to re-run: a job already closed by a prior run
// no longer matches the 'delivered' filter, so it's never re-queued.
const backfillCloseJobsSchema = z.object({
  tenantId: z.string().min(1),
});

export type BackfillCloseJobsPayload = z.infer<typeof backfillCloseJobsSchema>;

export interface BackfillCloseJobsResult extends DocData {
  jobIds: string[];
}

export const backfillCloseJobsHandler: ActionHandler<BackfillCloseJobsPayload, BackfillCloseJobsResult> = {
  type: 'backfillCloseJobs',
  idempotent: true,
  parse: zodParse(backfillCloseJobsSchema),
  async execute(tx, ctx, payload) {
    await requireMember(tx, payload.tenantId, ctx.actorId, ['owner', 'dispatcher']);

    const [asShipper, asCarrier] = await Promise.all([
      tx.query({
        collection: jobsCollection(),
        filters: [
          { field: 'shipperTenantId', op: '==', value: payload.tenantId },
          { field: 'status', op: '==', value: 'delivered' },
        ],
      }),
      tx.query({
        collection: jobsCollection(),
        filters: [
          { field: 'carrierTenantId', op: '==', value: payload.tenantId },
          { field: 'status', op: '==', value: 'delivered' },
        ],
      }),
    ]);

    const seen = new Set<string>();
    const jobIds: string[] = [];
    for (const row of [...asShipper, ...asCarrier]) {
      const job = row.data as unknown as Job;
      if (seen.has(job.jobId)) continue;
      seen.add(job.jobId);
      jobIds.push(job.jobId);

      const taskId = ctx.newId('task');
      const task: OutboxTask = {
        taskId,
        type: 'closeJob',
        status: 'pending',
        tenantId: job.shipperTenantId,
        jobId: job.jobId,
        attempts: 0,
        createdAt: ctx.now,
      };
      tx.write({ kind: 'create', path: outboxTaskDoc(taskId), data: { ...task } });
    }

    return {
      result: { jobIds },
      auditDetail: { tenantId: payload.tenantId, jobIds },
    };
  },
};
