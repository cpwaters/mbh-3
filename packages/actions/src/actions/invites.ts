import { z } from 'zod';
import { AppError, inviteExpiresAt, inviteState, inviteStateMessage, type Invite, type Role } from '@mbh/domain';
import { inviteDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireFounder } from '../require-founder.js';
import { requireMember } from '../require-member.js';
import { zodParse } from '../parse.js';

// Minting and withdrawing invitations to the marketplace.
//
// Any active member of a company may invite another company in — a haulier
// vouching for the firm they subcontract to is how a marketplace like this
// actually grows. Which is a real widening of the gate: "invitation-only"
// now means "anyone already in can bring someone in", not "the founder
// chooses everyone". Withdrawing stays the founder's, since only they can
// see the list of what is outstanding.
const INVITE_ROLES: readonly Role[] = ['owner', 'dispatcher', 'driver'];

const createInviteSchema = z.object({
  // A note about who it is for. Never shown to the invitee.
  note: z.string().max(200).optional(),
  // The company doing the inviting. Absent means the founder minting from
  // their own toolbar, which is checked the other way.
  tenantId: z.string().optional(),
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
    // Two ways to be allowed: acting for a company you are a member of, or
    // being the founder (who mints from the toolbar, for no company).
    if (payload.tenantId !== undefined && payload.tenantId !== '') {
      await requireMember(tx, payload.tenantId, ctx.actorId, INVITE_ROLES);
    } else {
      requireFounder(ctx);
    }

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
      ...(payload.tenantId !== undefined && payload.tenantId !== ''
        ? { createdByTenantId: payload.tenantId }
        : {}),
      expiresAt,
    };
    tx.write({ kind: 'create', path: inviteDoc(inviteId), data: { ...invite } });

    return {
      result: { inviteId, expiresAt },
      // The note, not the id: an audit entry is readable by more people than
      // the link should be.
      auditDetail: {
        note: invite.note,
        expiresAt,
        ...(payload.tenantId !== undefined ? { tenantId: payload.tenantId } : {}),
      },
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
