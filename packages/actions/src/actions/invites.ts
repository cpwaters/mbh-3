import { z } from 'zod';
import { AppError, inviteExpiresAt, inviteState, inviteStateMessage, type Invite } from '@mbh/domain';
import { inviteDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireFounder } from '../require-founder.js';
import { zodParse } from '../parse.js';

// Minting and withdrawing invitations to the marketplace. Founder-only:
// whoever can mint decides who trades here, so this is checked against the
// verified token email, not a client-supplied claim.

const createInviteSchema = z.object({
  // The founder's own note about who it is for. Never shown to the invitee.
  note: z.string().max(200).optional(),
});

export type CreateInvitePayload = z.infer<typeof createInviteSchema>;

export interface CreateInviteResult extends DocData {
  inviteId: string;
  expiresAt: string;
}

export const createInviteHandler: ActionHandler<CreateInvitePayload, CreateInviteResult> = {
  type: 'createInvite',
  idempotent: true,
  parse: zodParse(createInviteSchema),
  async execute(tx, ctx, payload) {
    requireFounder(ctx);

    // The id is the secret: at the composition root newId is randomUUID, so
    // this is 122 bits of CSPRNG entropy, not a guessable counter.
    const inviteId = ctx.newId('inv');
    const expiresAt = inviteExpiresAt(ctx.now);
    const invite: Invite = {
      inviteId,
      status: 'pending',
      note: (payload.note ?? '').trim(),
      createdAt: ctx.now,
      createdBy: ctx.actorId,
      expiresAt,
    };
    tx.write({ kind: 'create', path: inviteDoc(inviteId), data: { ...invite } });

    return {
      result: { inviteId, expiresAt },
      // The note, not the id: an audit entry is readable by more people than
      // the link should be.
      auditDetail: { note: invite.note, expiresAt },
    };
  },
};

const revokeInviteSchema = z.object({
  inviteId: z.string().min(1),
});

export type RevokeInvitePayload = z.infer<typeof revokeInviteSchema>;

export interface RevokeInviteResult extends DocData {
  inviteId: string;
}

// Withdraw an unused invitation. A redeemed one cannot be withdrawn — the
// company it created is already trading, and pretending otherwise would make
// the record lie about what happened.
export const revokeInviteHandler: ActionHandler<RevokeInvitePayload, RevokeInviteResult> = {
  type: 'revokeInvite',
  idempotent: true,
  parse: zodParse(revokeInviteSchema),
  async execute(tx, ctx, payload) {
    requireFounder(ctx);

    const path = inviteDoc(payload.inviteId);
    const data = await tx.get(path);
    if (data === null) {
      throw new AppError('not-found', 'That invitation no longer exists.');
    }
    const invite = data as unknown as Invite;
    if (invite.status === 'redeemed') {
      throw new AppError('conflict', 'That invitation has already been used.', { recoverable: false });
    }
    // Revoking an already-revoked one is a no-op, so a double tap is safe.
    tx.write({ kind: 'update', path, data: { status: 'revoked' } });

    return { result: { inviteId: payload.inviteId }, auditDetail: { inviteId: payload.inviteId } };
  },
};

// Shared by createTenant: read the invite, refuse it in the invitee's own
// terms, and return the write that spends it. Kept here so the rule for what
// a usable invite is lives in one place.
export async function redeemInviteOp(
  tx: Parameters<ActionHandler<unknown, DocData>['execute']>[0],
  ctx: { actorId: string; now: string },
  inviteId: string,
  tenantId: string
): Promise<{ kind: 'update'; path: string; data: DocData }> {
  const path = inviteDoc(inviteId);
  const data = await tx.get(path);
  if (data === null) {
    throw new AppError('not-found', 'That invitation link is not valid.');
  }
  const invite = data as unknown as Invite;
  const state = inviteState(invite, ctx.now);
  if (state !== 'valid') {
    // Not recoverable: retrying will never make a spent link work.
    throw new AppError('conflict', inviteStateMessage(state), { recoverable: false });
  }
  return {
    kind: 'update',
    path,
    data: {
      status: 'redeemed',
      redeemedAt: ctx.now,
      redeemedBy: ctx.actorId,
      redeemedTenantId: tenantId,
    },
  };
}
