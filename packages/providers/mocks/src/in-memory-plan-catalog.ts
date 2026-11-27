import type { PlanTier } from '@mbh/domain';
import { PlanCatalogError, type PlanCatalog, type PlanPriceResult } from '@mbh/provider-interfaces';

// Scriptable in-memory PlanCatalog — the CI default. Records each price it
// was asked to set; `failOnce` forces one error (retryable unless told
// otherwise) so the drain's retry and give-up paths are testable.
export class InMemoryPlanCatalog implements PlanCatalog {
  readonly calls: { tier: PlanTier; pence: number }[] = [];
  private fail: { message: string; recoverable: boolean } | null = null;
  private n = 0;

  failOnce(message = 'scripted catalog failure', recoverable = true): this {
    this.fail = { message, recoverable };
    return this;
  }

  async setMonthlyPrice(tier: PlanTier, pence: number): Promise<PlanPriceResult> {
    if (this.fail !== null) {
      const { message, recoverable } = this.fail;
      this.fail = null;
      throw new PlanCatalogError(message, recoverable);
    }
    this.calls.push({ tier, pence });
    this.n += 1;
    return { priceId: `price_mock_${this.n}`, paymentLink: `https://buy.stripe.com/test_mock_${tier}_${this.n}` };
  }
}
