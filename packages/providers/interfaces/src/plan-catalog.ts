import type { PlanTier } from '@mbh/domain';

// Where a plan's monthly price is set at the payment provider. Called only by
// the drain (never in a user's request), when the founder changes a price in
// the back office.
//
// setMonthlyPrice must be safe to call again after a crash part-way through:
// a second call with the same amount finishes the job rather than duplicating
// it. Subscribers already paying the old price keep paying it.
export interface PlanPriceResult {
  priceId: string; // the price now sold for the plan
  paymentLink: string; // the public link that sells it (may be a new URL)
}

export interface PlanCatalog {
  setMonthlyPrice(tier: PlanTier, pence: number): Promise<PlanPriceResult>;
}

export class PlanCatalogError extends Error {
  readonly recoverable: boolean;
  constructor(message: string, recoverable = true) {
    super(message);
    this.name = 'PlanCatalogError';
    this.recoverable = recoverable;
  }
}
