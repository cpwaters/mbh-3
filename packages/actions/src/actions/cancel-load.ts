import { z } from 'zod';
import { AppError, canTransitionLoad, type Load, type LoadStatus, type Role } from '@mbh/domain';
import { listingDoc, loadDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireMember } from '../require-member.js';
import { zodParse } from '../parse.js';

// A shipper cancels one of their own still-available loads. Roles allowed to
// manage the shipper's loads.
const CANCEL_ROLES: readonly Role[] = ['owner', 'dispatcher'];

const cancelLoadSchema = z.object({
  shipperTenantId: z.string().min(1),
  loadId: z.string().min(1),
});

export type CancelLoadPayload = z.infer<typeof cancelLoadSchema>;

export interface CancelLoadResult extends DocData {
  loadId: string;
}

export const cancelLoadHandler: ActionHandler<CancelLoadPayload, CancelLoadResult> = {
  type: 'cancelLoad',
  idempotent: true,
  parse: zodParse(cancelLoadSchema),
  async execute(tx, ctx, payload) {
    await requireMember(tx, payload.shipperTenantId, ctx.actorId, CANCEL_ROLES);

    const data = await tx.get(loadDoc(payload.loadId));
    if (data === null) {
      throw new AppError('not-found', 'That load no longer exists.');
    }
    const load = data as unknown as Load;
    if (load.tenantId !== payload.shipperTenantId) {
      throw new AppError('forbidden', 'That load belongs to another company.');
    }
    if (load.status !== ('available' satisfies LoadStatus) || !canTransitionLoad(load.status, 'cancelled')) {
      throw new AppError('conflict', 'Only available loads can be cancelled.', { recoverable: false });
    }

    tx.write({ kind: 'update', path: loadDoc(payload.loadId), data: { status: 'cancelled' } });
    // Drop it from the carrier browse projection.
    tx.write({ kind: 'delete', path: listingDoc(payload.loadId) });

    return { result: { loadId: payload.loadId }, auditDetail: { loadId: payload.loadId } };
  },
};
