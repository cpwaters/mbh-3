import {
  AppError,
  DEFAULT_BILLING_CONFIG,
  PICKUP_ALLOWANCE,
  POSTING_ALLOWANCE,
  allowancePeriodStart,
  checkAcceptAllowed,
  checkLoadAllowance,
  effectivePlan,
  type AllowanceCheck,
  type BillingConfig,
  type Job,
  type Load,
  type Tenant,
} from '@mbh/domain';
import { billingConfigDoc, jobsCollection, loadsCollection } from '@mbh/paths';
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

// Whether the shipper's plan has room for one more load in the current
// period — today (UK) on the free allowance, this month on a shipper plan.
//
// Every load posted in the period counts, cancelled ones included —
// otherwise post-and-cancel is a way round the allowance. Counted inside the
// posting transaction, so two posts racing for the last slot cannot both get
// it.
export async function requireLoadAllowance(tx: TransactionContext, tenant: Tenant, now: string): Promise<void> {
  if (!(await enforced(tx))) return;
  const tier = effectivePlan(tenant, now);
  const allowance = POSTING_ALLOWANCE[tier];
  if (allowance === null) return;

  const since = allowancePeriodStart(allowance, now);
  // By tenantId alone and narrowed here: no composite index to forget.
  const rows = await tx.query({
    collection: loadsCollection(),
    filters: [{ field: 'tenantId', op: '==', value: tenant.tenantId }],
  });
  const posted = rows.filter((row) => ((row.data as unknown as Load).createdAt ?? '') >= since).length;

  refuseUnless(checkLoadAllowance(tier, posted));
}

// Whether the carrier may pick up one more load: unlimited in its trial or on
// any plan, one a day (UK) without. Work already accepted is never stopped by
// this — collecting and delivering a load in hand stay free whatever the plan
// says. A load handed back (relisted) deletes its job, so it does not count.
export async function requireAcceptPlan(tx: TransactionContext, carrier: Tenant, now: string): Promise<void> {
  if (!(await enforced(tx))) return;
  const tier = effectivePlan(carrier, now);
  const allowance = PICKUP_ALLOWANCE[tier];
  if (allowance === null) return;

  const since = allowancePeriodStart(allowance, now);
  const rows = await tx.query({
    collection: jobsCollection(),
    filters: [{ field: 'carrierTenantId', op: '==', value: carrier.tenantId }],
  });
  const accepted = rows.filter((row) => ((row.data as unknown as Job).createdAt ?? '') >= since).length;

  refuseUnless(checkAcceptAllowed(tier, accepted));
}
