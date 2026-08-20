import { z } from 'zod';
import {
  AppError,
  isFounderEmail,
  validateTenantSetup,
  type Member,
  type Tenant,
  type UserProfile,
} from '@mbh/domain';
import { memberDoc, tenantDoc, userProfileDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { zodParse } from '../parse.js';
import { redeemInviteOp } from './invites.js';

// Onboarding: a signed-in user creates a company and becomes its owner. No
// membership precondition — this is how a user gets their first tenant. The
// tenant + the creator's owner membership are created in one transaction.
//
// The marketplace is invitation-only. Anyone may create an ACCOUNT, but a
// company is what actually puts you on the marketplace, so it takes a valid
// invitation — spent here, in the same transaction that creates the company,
// so a link can never make two.
const createTenantSchema = z.object({
  name: z.string().min(1),
  capabilities: z.array(z.enum(['shipper', 'carrier'])).min(1),
  inviteId: z.string().optional(),
});

export type CreateTenantPayload = z.infer<typeof createTenantSchema>;

export interface CreateTenantResult extends DocData {
  tenantId: string;
}

export const createTenantHandler: ActionHandler<CreateTenantPayload, CreateTenantResult> = {
  type: 'createTenant',
  idempotent: true,
  parse: zodParse(createTenantSchema),
  async execute(tx, ctx, payload) {
    const check = validateTenantSetup(payload);
    if (!check.ok) {
      throw new AppError('invalid-payload', check.message, { field: check.field });
    }

    // The founder does not invite themselves.
    const founder = isFounderEmail(ctx.actorEmail);
    if (!founder && (payload.inviteId === undefined || payload.inviteId === '')) {
      throw new AppError('forbidden', 'Joining MyBackHaul is by invitation. Ask for an invite link.', {
        field: 'inviteId',
      });
    }

    // The owner's member name comes from their profile if they have set one.
    const profileData = await tx.get(userProfileDoc(ctx.actorId));
    const displayName = ((profileData as UserProfile | null)?.displayName ?? 'Owner').trim() || 'Owner';

    const capabilities = [...new Set(payload.capabilities)];
    const tenantId = ctx.newId('tenant');
    const tenant: Tenant = {
      tenantId,
      name: payload.name.trim(),
      capabilities,
      createdAt: ctx.now,
    };
    const member: Member = {
      tenantId,
      actorId: ctx.actorId,
      displayName,
      role: 'owner',
      status: 'active',
      createdAt: ctx.now,
    };

    // Read and check the invite BEFORE writing anything, then spend it in the
    // same batch as the company it paid for: either both land or neither does.
    const spendInvite =
      payload.inviteId !== undefined && payload.inviteId !== ''
        ? await redeemInviteOp(tx, ctx, payload.inviteId, tenantId)
        : null;

    tx.write({ kind: 'create', path: tenantDoc(tenantId), data: { ...tenant } });
    tx.write({ kind: 'create', path: memberDoc(tenantId, ctx.actorId), data: { ...member } });
    if (spendInvite !== null) tx.write(spendInvite);

    return {
      result: { tenantId },
      auditDetail: { tenantId, name: tenant.name, capabilities },
    };
  },
};
