import type { BillingConfig, PlanSubject } from '@mbh/domain';

// What a company's Billing page needs: the platform's billing switchboard
// (any signed-in user), its own company's plan and trial (members of that
// company, via the tenant read rule), and how many loads it has posted since
// a given instant — the same count the server makes before allowing one more.
export interface BillingReader {
  billingConfig(): Promise<BillingConfig>;
  tenantPlan(tenantId: string): Promise<PlanSubject | null>;
  loadsPostedSince(tenantId: string, sinceIso: string): Promise<number>;
}
