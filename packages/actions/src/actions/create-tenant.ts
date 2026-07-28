import { z } from 'zod';
import {
  AppError,
  validateTenantSetup,
  type Member,
  type Tenant,
  type UserProfile,
} from '@mbh/domain';
import { memberDoc, tenantDoc, userProfileDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { zodParse } from '../parse.js';

// Onboarding: a signed-in user creates a company and becomes its owner. No
// membership precondition — this is how a user gets their first tenant. The
// tenant + the creator's owner membership are created in one transaction.
const createTenantSchema = z.object({
  name: z.string().min(1),
  capabilities: z.array(z.enum(['shipper', 'carrier'])).min(1),
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

    tx.write({ kind: 'create', path: tenantDoc(tenantId), data: { ...tenant } });
    tx.write({ kind: 'create', path: memberDoc(tenantId, ctx.actorId), data: { ...member } });

    return {
      result: { tenantId },
      auditDetail: { tenantId, name: tenant.name, capabilities },
    };
  },
};
