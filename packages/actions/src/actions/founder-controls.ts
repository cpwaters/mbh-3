import { z } from 'zod';
import {
  AppError,
  isTenantSuspended,
  isValidSuspensionReason,
  listingFromLoad,
  type Load,
  type Member,
  type Tenant,
} from '@mbh/domain';
import { listingDoc, loadsCollection, memberDoc, tenantDoc } from '@mbh/paths';
import type { DocData, TransactionContext } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireFounder } from '../require-founder.js';
import { zodParse } from '../parse.js';

// The founder's controls over the marketplace, from the back office. Each is
// an ordinary action — validated, founder-gated on the verified token,
// audited in the same transaction — because "the admin can change anything"
// must not mean "the admin bypasses the one mutation path".
//
// Nothing here deletes. A company is suspended, not removed; a member is
// disabled, not deleted — attribution in the audit log and on job events has
// to keep resolving to someone.

async function readTenant(tx: TransactionContext, tenantId: string): Promise<Tenant> {
  const data = await tx.get(tenantDoc(tenantId));
  if (data === null) {
    throw new AppError('not-found', 'That company no longer exists.');
  }
  return data as unknown as Tenant;
}

// The company's loads that are still on offer. Queried by tenantId alone and
// narrowed here, so the read needs no composite index.
async function availableLoads(tx: TransactionContext, tenantId: string): Promise<Load[]> {
  const rows = await tx.query({
    collection: loadsCollection(),
    filters: [{ field: 'tenantId', op: '==', value: tenantId }],
  });
  return rows.map((row) => row.data as unknown as Load).filter((load) => load.status === 'available');
}

const suspendCompanySchema = z.object({
  tenantId: z.string().min(1),
  reason: z.string().refine(isValidSuspensionReason, 'Say why, in a few words — the company will see it.'),
});

export type SuspendCompanyPayload = z.infer<typeof suspendCompanySchema>;

export interface SuspendCompanyResult extends DocData {
  tenantId: string;
  withdrawnLoads: number;
}

// Stop a company trading: its members can still sign in and read their
// records, but every action they try is refused (requireMember), and its
// available loads leave the carrier browse. Jobs already under way keep
// their records; nothing is rolled back.
//
// One consequence is deliberate: a suspended carrier's driver mid-job cannot
// then record delivery, because deliverJob goes through requireMember too.
// "Nobody at this company can act" has to mean that, so the company page
// shows the founder its jobs under way before they press the button.
export const suspendCompanyHandler: ActionHandler<SuspendCompanyPayload, SuspendCompanyResult> = {
  type: 'suspendCompany',
  idempotent: true,
  parse: zodParse(suspendCompanySchema),
  async execute(tx, ctx, payload) {
    requireFounder(ctx);
    const tenant = await readTenant(tx, payload.tenantId);
    const loads = await availableLoads(tx, payload.tenantId);
    const reason = payload.reason.trim();

    tx.write({
      kind: 'update',
      path: tenantDoc(payload.tenantId),
      data: { status: 'suspended', suspendedReason: reason, suspendedAt: ctx.now },
    });
    // Deleting an already-absent listing is a no-op, so suspending twice is safe.
    for (const load of loads) {
      tx.write({ kind: 'delete', path: listingDoc(load.loadId) });
    }

    return {
      result: { tenantId: payload.tenantId, withdrawnLoads: loads.length },
      auditDetail: {
        tenantId: payload.tenantId,
        companyName: tenant.name,
        reason,
        withdrawnLoads: loads.length,
      },
    };
  },
};

const reinstateCompanySchema = z.object({
  tenantId: z.string().min(1),
});

export type ReinstateCompanyPayload = z.infer<typeof reinstateCompanySchema>;

export interface ReinstateCompanyResult extends DocData {
  tenantId: string;
  relistedLoads: number;
}

// Undo a suspension: members can act again and the company's still-available
// loads go back on the browse, rebuilt from the load so the listing is
// current rather than whatever it was when withdrawn.
export const reinstateCompanyHandler: ActionHandler<ReinstateCompanyPayload, ReinstateCompanyResult> = {
  type: 'reinstateCompany',
  idempotent: true,
  parse: zodParse(reinstateCompanySchema),
  async execute(tx, ctx, payload) {
    requireFounder(ctx);
    const tenant = await readTenant(tx, payload.tenantId);
    if (!isTenantSuspended(tenant)) {
      return {
        result: { tenantId: payload.tenantId, relistedLoads: 0 },
        auditDetail: { tenantId: payload.tenantId, noop: true },
      };
    }
    const loads = await availableLoads(tx, payload.tenantId);

    tx.write({ kind: 'update', path: tenantDoc(payload.tenantId), data: { status: 'active', reinstatedAt: ctx.now } });
    for (const load of loads) {
      tx.write({ kind: 'set', path: listingDoc(load.loadId), data: { ...listingFromLoad(load) } });
    }

    return {
      result: { tenantId: payload.tenantId, relistedLoads: loads.length },
      auditDetail: { tenantId: payload.tenantId, companyName: tenant.name, relistedLoads: loads.length },
    };
  },
};

const setMemberStatusSchema = z.object({
  tenantId: z.string().min(1),
  actorId: z.string().min(1),
  status: z.enum(['active', 'disabled']),
});

export type SetMemberStatusPayload = z.infer<typeof setMemberStatusSchema>;

export interface SetMemberStatusResult extends DocData {
  actorId: string;
  status: string;
}

async function readMember(tx: TransactionContext, tenantId: string, actorId: string): Promise<Member> {
  const data = await tx.get(memberDoc(tenantId, actorId));
  if (data === null) {
    throw new AppError('not-found', 'That person is not a member of this company.');
  }
  return data as unknown as Member;
}

// Disable (or re-enable) one person's membership of one company. Disabled,
// never deleted: their name must keep resolving on the jobs they did.
export const setMemberStatusHandler: ActionHandler<SetMemberStatusPayload, SetMemberStatusResult> = {
  type: 'setMemberStatus',
  idempotent: true,
  parse: zodParse(setMemberStatusSchema),
  async execute(tx, ctx, payload) {
    requireFounder(ctx);
    const member = await readMember(tx, payload.tenantId, payload.actorId);
    tx.write({ kind: 'update', path: memberDoc(payload.tenantId, payload.actorId), data: { status: payload.status } });
    return {
      result: { actorId: payload.actorId, status: payload.status },
      auditDetail: {
        tenantId: payload.tenantId,
        memberActorId: payload.actorId,
        displayName: member.displayName,
        from: member.status,
        to: payload.status,
      },
    };
  },
};

const setMemberRoleSchema = z.object({
  tenantId: z.string().min(1),
  actorId: z.string().min(1),
  role: z.enum(['owner', 'dispatcher', 'driver']),
});

export type SetMemberRolePayload = z.infer<typeof setMemberRoleSchema>;

export interface SetMemberRoleResult extends DocData {
  actorId: string;
  role: string;
}

export const setMemberRoleHandler: ActionHandler<SetMemberRolePayload, SetMemberRoleResult> = {
  type: 'setMemberRole',
  idempotent: true,
  parse: zodParse(setMemberRoleSchema),
  async execute(tx, ctx, payload) {
    requireFounder(ctx);
    const member = await readMember(tx, payload.tenantId, payload.actorId);
    tx.write({ kind: 'update', path: memberDoc(payload.tenantId, payload.actorId), data: { role: payload.role } });
    return {
      result: { actorId: payload.actorId, role: payload.role },
      auditDetail: {
        tenantId: payload.tenantId,
        memberActorId: payload.actorId,
        displayName: member.displayName,
        from: member.role,
        to: payload.role,
      },
    };
  },
};
