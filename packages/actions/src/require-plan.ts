import {
  AppError,
  DEFAULT_BILLING_CONFIG,
  checkAcceptAllowed,
  checkLoadAllowance,
  effectivePlan,
  monthStartUtc,
  type AllowanceCheck,
  type BillingConfig,
  type Load,
  type Tenant,
} from '@mbh/domain';
import { billingConfigDoc, loadsCollection } from '@mbh/paths';
import type { TransactionContext } from '@mbh/provider-interfaces';

// Plan gates. Both are no-ops until the founder switches enforcement on
// (BillingConfig.enforced), so the code can ship before Stripe is set up
// without locking anyone out — trial or no trial.

async function enforced(tx: TransactionContext): Promise<boolean> {
  const config = ((await tx.get(billingConfigDoc())) as unknown as BillingConfig | null) ?? DEFAULT_BILLING_CONFIG;
  return config.enforced;
}

function refuseUnless(check: AllowanceCheck): void {
  if (!check.ok) throw new AppError('forbidden', check.message, { recoverable: false });
}

// Whether the shipper's plan has room for one more load this month.
//
// Every load posted this month counts, cancelled ones included — otherwise
// post-and-cancel is a way round the allowance. Counted inside the posting
// transaction, so two posts racing for the last slot cannot both get it.
export async function requireLoadAllowance(tx: TransactionContext, tenant: Tenant, now: string): Promise<void> {
  if (!(await enforced(tx))) return;

  const monthStart = monthStartUtc(now);
  // By tenantId alone and narrowed here: no composite index to forget.
  const rows = await tx.query({
    collection: loadsCollection(),
    filters: [{ field: 'tenantId', op: '==', value: tenant.tenantId }],
  });
  const postedThisMonth = rows.filter((row) => ((row.data as unknown as Load).createdAt ?? '') >= monthStart).length;

  refuseUnless(checkLoadAllowance(effectivePlan(tenant, now), postedThisMonth));
}

// Whether the carrier may accept a load: in its trial, or on any plan. Work
// already accepted is never stopped by this — collecting and delivering a
// load in hand stay free whatever the plan says.
export async function requireAcceptPlan(tx: TransactionContext, carrier: Tenant, now: string): Promise<void> {
  if (!(await enforced(tx))) return;
  refuseUnless(checkAcceptAllowed(effectivePlan(carrier, now)));
}
