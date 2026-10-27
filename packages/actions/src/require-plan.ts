import {
  AppError,
  DEFAULT_BILLING_CONFIG,
  checkLoadAllowance,
  effectiveTier,
  monthStartUtc,
  type BillingConfig,
  type Load,
  type Tenant,
} from '@mbh/domain';
import { billingConfigDoc, loadsCollection } from '@mbh/paths';
import type { TransactionContext } from '@mbh/provider-interfaces';

// Whether the shipper's plan has room for one more load this month. A no-op
// until the founder switches enforcement on (BillingConfig.enforced), so the
// code can ship before Stripe is set up without locking anyone out.
//
// Every load posted this month counts, cancelled ones included — otherwise
// post-and-cancel is a way round the allowance. Counted inside the posting
// transaction, so two posts racing for the last slot cannot both get it.
export async function requireLoadAllowance(tx: TransactionContext, tenant: Tenant, now: string): Promise<void> {
  const config = ((await tx.get(billingConfigDoc())) as unknown as BillingConfig | null) ?? DEFAULT_BILLING_CONFIG;
  if (!config.enforced) return;

  const monthStart = monthStartUtc(now);
  // By tenantId alone and narrowed here: no composite index to forget.
  const rows = await tx.query({
    collection: loadsCollection(),
    filters: [{ field: 'tenantId', op: '==', value: tenant.tenantId }],
  });
  const postedThisMonth = rows.filter((row) => ((row.data as unknown as Load).createdAt ?? '') >= monthStart).length;

  const check = checkLoadAllowance(effectiveTier(tenant.billing), postedThisMonth);
  if (!check.ok) {
    throw new AppError('forbidden', check.message, { recoverable: false });
  }
}
