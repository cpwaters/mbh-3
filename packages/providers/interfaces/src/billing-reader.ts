import type { BillingConfig, TenantBilling } from '@mbh/domain';

// What a shipper's Billing page needs: the platform's billing switchboard
// (any signed-in user), its own company's plan (members of that company,
// via the tenant read rule), and how many loads it has posted since a given
// instant — the same count the server makes before allowing one more.
export interface BillingReader {
  billingConfig(): Promise<BillingConfig>;
  tenantBilling(tenantId: string): Promise<TenantBilling | null>;
  loadsPostedSince(tenantId: string, sinceIso: string): Promise<number>;
}
