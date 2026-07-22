import { z } from 'zod';
import { AppError, validateDeliveryEvidence, type JobEvent, type JobEvidence } from '@mbh/domain';
import { jobDoc, jobEventDoc, jobEvidenceDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { guardJobTransition, loadJobForDriver } from '../job-access.js';
import { zodParse } from '../parse.js';

// The atomic legal event. The Proof of Delivery evidence record and the
// in_transit -> delivered status change (plus the append-only event) commit
// in ONE batch — they can never exist without each other. This is the
// product's reason to exist and the offline "30-second moment"'s payload.

const deliverJobSchema = z.object({
  carrierTenantId: z.string().min(1),
  jobId: z.string().min(1),
  photoRefs: z.array(z.string().min(1)).min(1),
  signatureRef: z.string().min(1),
  recipientName: z.string().trim().min(1),
  location: z.object({ lat: z.number().finite(), lng: z.number().finite() }).optional(),
});

export type DeliverJobPayload = z.infer<typeof deliverJobSchema>;

export interface DeliverJobResult extends DocData {
  jobId: string;
  evidenceId: string;
}

export const deliverJobHandler: ActionHandler<DeliverJobPayload, DeliverJobResult> = {
  type: 'deliverJob',
  idempotent: true, // offline-retriable — this is the field capture
  parse: zodParse(deliverJobSchema),
  async execute(tx, ctx, payload) {
    const job = await loadJobForDriver(tx, payload.jobId, payload.carrierTenantId, ctx.actorId);
    guardJobTransition(job.status, 'delivered');

    // Defence beyond the schema: the domain owns what a valid PoD requires.
    const check = validateDeliveryEvidence(payload);
    if (!check.ok) {
      throw new AppError('invalid-payload', check.message, { field: check.field });
    }

    const evidenceId = ctx.newId('evd');
    const evidence: JobEvidence = {
      evidenceId,
      jobId: job.jobId,
      kind: 'delivery',
      photoRefs: payload.photoRefs,
      signatureRef: payload.signatureRef,
      recipientName: payload.recipientName,
      capturedAt: ctx.now,
      ...(payload.location !== undefined ? { location: payload.location } : {}),
      actorId: ctx.actorId,
    };

    const eventId = ctx.newId('evt');
    const event: JobEvent = {
      eventId,
      jobId: job.jobId,
      type: 'job.delivered',
      at: ctx.now,
      actorId: ctx.actorId,
      source: 'member',
      detail: { evidenceId },
    };

    // One batch: evidence + status + event.
    tx.write({ kind: 'create', path: jobEvidenceDoc(job.jobId, evidenceId), data: { ...evidence } });
    tx.write({ kind: 'update', path: jobDoc(job.jobId), data: { status: 'delivered', deliveredAt: ctx.now } });
    tx.write({ kind: 'create', path: jobEventDoc(job.jobId, eventId), data: { ...event } });

    return {
      result: { jobId: job.jobId, evidenceId },
      auditDetail: { jobId: job.jobId, evidenceId },
    };
  },
};
