import { z } from 'zod';
import { AppError, type OutboxTask, type UserProfile } from '@mbh/domain';
import { outboxTaskDoc, userProfileDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireMember } from '../require-member.js';
import { zodParse } from '../parse.js';

// A debug tool (surfaced on the founder toolbar) to verify the invoice email
// pipeline — SMTP config, HTML/PDF rendering — end to end, without needing a
// real delivered job. Sends synthetic invoice content, and ONLY ever to the
// requesting actor's OWN profile email (never a client-supplied address —
// that would let any authorized member spam arbitrary inboxes through the
// platform's SMTP identity, and never a real shipper's — a "test" send must
// never surprise a real customer). Enqueues an outbox task like every other
// outbound call; nothing here talks to SMTP directly.
const sendTestInvoiceEmailSchema = z.object({
  // Any tenant the actor is an active member of — purely for the
  // denormalized OutboxTask.tenantId and a lightweight authorization check
  // (a real member of something, not a bare token holder). Not otherwise used.
  tenantId: z.string().min(1),
});

export type SendTestInvoiceEmailPayload = z.infer<typeof sendTestInvoiceEmailSchema>;

export interface SendTestInvoiceEmailResult extends DocData {
  taskId: string;
}

export const sendTestInvoiceEmailHandler: ActionHandler<
  SendTestInvoiceEmailPayload,
  SendTestInvoiceEmailResult
> = {
  type: 'sendTestInvoiceEmail',
  idempotent: true,
  parse: zodParse(sendTestInvoiceEmailSchema),
  async execute(tx, ctx, payload) {
    await requireMember(tx, payload.tenantId, ctx.actorId, ['owner', 'dispatcher', 'driver']);

    const profileData = await tx.get(userProfileDoc(ctx.actorId));
    const recipientEmail = (profileData as UserProfile | null)?.email?.trim();
    if (recipientEmail === undefined || recipientEmail === '') {
      throw new AppError('conflict', 'Add an email address to your profile first, then try again.', {
        recoverable: false,
      });
    }

    const taskId = ctx.newId('task');
    const task: OutboxTask = {
      taskId,
      type: 'sendTestInvoiceEmail',
      status: 'pending',
      tenantId: payload.tenantId,
      recipientEmail,
      actorId: ctx.actorId,
      attempts: 0,
      createdAt: ctx.now,
    };
    tx.write({ kind: 'create', path: outboxTaskDoc(taskId), data: { ...task } });

    return {
      result: { taskId },
      auditDetail: { taskId, recipientEmail },
    };
  },
};
