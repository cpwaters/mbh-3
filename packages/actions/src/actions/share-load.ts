import { z } from 'zod';
import { AppError, shareCodeFrom, type LoadShare, type Load, type Role, type Tenant } from '@mbh/domain';
import { listingDoc, loadDoc, shareDoc, sharesCollection, tenantDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireMember } from '../require-member.js';
import { zodParse } from '../parse.js';

// Anyone at a company may share a load: the shipper its own, a carrier any
// load on the board.
const SHARE_ROLES: readonly Role[] = ['owner', 'dispatcher', 'driver'];

// A fresh code clashing with one already issued is a 1-in-62^8 event; a few
// tries make it vanishingly rare, and the last resort is to say so.
const CODE_ATTEMPTS = 5;

const shareLoadSchema = z.object({
  // The company the sharer is acting as.
  tenantId: z.string().min(1),
  loadId: z.string().min(1),
});

export type ShareLoadPayload = z.infer<typeof shareLoadSchema>;

export interface ShareLoadResult extends DocData {
  code: string;
}

// Issue the load's short link, or hand back the one it already has: one link
// per load however often it is shared, so the share records stay as few as
// the loads. Only a load still on offer (its listing exists) can be shared;
// the public page then shows that listing, and says when it has gone.
export const shareLoadHandler: ActionHandler<ShareLoadPayload, ShareLoadResult> = {
  type: 'shareLoad',
  idempotent: true,
  parse: zodParse(shareLoadSchema),
  async execute(tx, ctx, payload) {
    await requireMember(tx, payload.tenantId, ctx.actorId, SHARE_ROLES);
    const tenant = (await tx.get(tenantDoc(payload.tenantId))) as unknown as Tenant | null;
    const load = (await tx.get(loadDoc(payload.loadId))) as unknown as Load | null;
    if (load === null) throw new AppError('not-found', 'That load no longer exists.');
    const ownLoad = load.tenantId === payload.tenantId;
    if (!ownLoad && !(tenant?.capabilities.includes('carrier') ?? false)) {
      throw new AppError('forbidden', 'Only the shipper who posted it, or a carrier, can share this load.');
    }
    if ((await tx.get(listingDoc(payload.loadId))) === null) {
      throw new AppError('conflict', 'That load is no longer on offer, so there is nothing to share.', {
        recoverable: false,
      });
    }

    // Already shared: the same link again. By loadId alone, no index needed.
    const existing = await tx.query({
      collection: sharesCollection(),
      filters: [{ field: 'loadId', op: '==', value: payload.loadId }],
    });
    const first = existing[0]?.data as unknown as LoadShare | undefined;
    if (first !== undefined) {
      return { result: { code: first.code }, auditDetail: { loadId: payload.loadId, code: first.code, reused: true } };
    }

    let code: string | null = null;
    for (let i = 0; i < CODE_ATTEMPTS && code === null; i += 1) {
      const candidate = shareCodeFrom(ctx.newId('share'));
      if ((await tx.get(shareDoc(candidate))) === null) code = candidate;
    }
    if (code === null) {
      throw new AppError('conflict', 'Could not make a link just now. Try again.', { recoverable: true });
    }
    const share: LoadShare = { code, loadId: payload.loadId, createdAt: ctx.now, createdBy: ctx.actorId };
    tx.write({ kind: 'create', path: shareDoc(code), data: { ...share } });
    return { result: { code }, auditDetail: { loadId: payload.loadId, code, reused: false } };
  },
};
