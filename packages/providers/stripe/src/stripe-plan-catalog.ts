import { PLAN_LABELS, PLAN_LOOKUP_KEYS, type PlanTier } from '@mbh/domain';
import { PlanCatalogError, type PlanCatalog, type PlanPriceResult } from '@mbh/provider-interfaces';
import type { StripeFetch } from './stripe-rest.js';

// Changes a plan's monthly price at Stripe, for the drain, when the founder
// sets a new price in the back office. A Stripe price's amount can never
// change, so a new price is made and the plan's lookup key moved onto it:
//
//   1. a new monthly GBP price on the plan's product, taking the lookup key
//      (the old price keeps metadata.mbh_tier, so its subscribers keep their
//      plan — see tierFromPrice);
//   2. a payment link selling the new price, and every other active link for
//      the plan switched off, so nobody can still buy at the old price;
//   3. the customer portal offering the new price when switching plans;
//   4. the plan's older monthly prices archived. Archiving stops new sales
//      only: subscribers already on an old price keep paying it.
//
// Every step looks before it writes, so a run that died part-way is finished
// by the next one rather than repeated.
//
// If the plan has no tagged price — someone edited or archived it in the
// Stripe dashboard, which makes a new untagged price — the plan is found by
// its product's metadata.mbh_tier instead, and a tagged price is made there.
type Obj = Record<string, unknown>;
type List = { data: Obj[] };

const idOf = (ref: unknown): string | undefined =>
  typeof ref === 'string' ? ref : typeof ref === 'object' && ref !== null ? ((ref as Obj).id as string | undefined) : undefined;

export class StripePlanCatalog implements PlanCatalog {
  constructor(
    private readonly stripe: StripeFetch,
    private readonly siteUrl: string
  ) {}

  async setMonthlyPrice(tier: PlanTier, pence: number): Promise<PlanPriceResult> {
    try {
      return await this.apply(tier, pence);
    } catch (err) {
      if (err instanceof PlanCatalogError) throw err;
      const status = (err as { status?: number }).status;
      // A 4xx other than rate limiting will fail the same way next time.
      const recoverable = status === undefined || status === 429 || status >= 500;
      throw new PlanCatalogError(err instanceof Error ? err.message : String(err), recoverable);
    }
  }

  private async apply(tier: PlanTier, pence: number): Promise<PlanPriceResult> {
    const { stripe } = this;
    const lookupKey = PLAN_LOOKUP_KEYS[tier];

    // 1. The plan's current price, and a new one if the amount differs.
    const found = (await stripe(`/v1/prices?lookup_keys[]=${lookupKey}&active=true`, { method: 'GET' })) as List;
    const current: Obj | undefined = found.data[0];
    const product = current !== undefined ? idOf(current.product) : await this.productFor(tier);
    if (product === undefined) {
      throw new PlanCatalogError(
        `Stripe has no product or price for ${PLAN_LABELS[tier]} yet. Run pnpm stripe:provision first (docs/runbooks/billing.md).`,
        false
      );
    }

    let price: Obj;
    if (current !== undefined && current.unit_amount === pence && current.currency === 'gbp') {
      price = current;
    } else {
      // Stamp the outgoing price with its plan first, in case it was made by
      // hand without one: its subscribers are identified by it from now on.
      const meta = current?.metadata as Record<string, string> | null | undefined;
      if (current !== undefined && meta?.mbh_tier !== tier) {
        await stripe(`/v1/prices/${String(current.id)}`, { method: 'POST', form: { 'metadata[mbh_tier]': tier } });
      }
      price = await stripe('/v1/prices', {
        method: 'POST',
        form: {
          product,
          currency: 'gbp',
          unit_amount: String(pence),
          'recurring[interval]': 'month',
          lookup_key: lookupKey,
          transfer_lookup_key: 'true',
          'metadata[mbh_tier]': tier,
        },
      });
    }
    const priceId = String(price.id);

    // 2. Exactly one active link for the plan, selling the new price.
    const links = (await stripe('/v1/payment_links?active=true&limit=100', { method: 'GET' })) as List;
    let keep: Obj | undefined;
    const retire: Obj[] = [];
    for (const link of links.data) {
      const items = (await stripe(`/v1/payment_links/${String(link.id)}/line_items?limit=10`, { method: 'GET' })) as List;
      const soldPrice = items.data[0]?.price;
      const sold = idOf(soldPrice);
      const soldProduct = typeof soldPrice === 'object' && soldPrice !== null ? idOf((soldPrice as Obj).product) : undefined;
      const ours = (link.metadata as Record<string, string> | undefined)?.mbh_tier === tier;
      if (sold === priceId && keep === undefined) keep = link;
      // Any other link for the plan: ours, or selling any price of its product
      // (including one made by hand in the dashboard).
      else if (ours || soldProduct === product || (current !== undefined && sold === String(current.id))) retire.push(link);
    }
    if (keep === undefined) {
      keep = await stripe('/v1/payment_links', {
        method: 'POST',
        form: {
          'line_items[0][price]': priceId,
          'line_items[0][quantity]': '1',
          'after_completion[type]': 'redirect',
          'after_completion[redirect][url]': `${this.siteUrl}/app/billing?checkout=done`,
          'metadata[mbh_tier]': tier,
        },
      });
    }
    for (const link of retire) {
      await stripe(`/v1/payment_links/${String(link.id)}`, { method: 'POST', form: { active: 'false' } });
    }

    // 3. The portal's plan switcher offers the new price for this product.
    const configs = (await stripe('/v1/billing_portal/configurations?limit=100', { method: 'GET' })) as List;
    const portal = configs.data.find((c) => (c.metadata as Record<string, string> | undefined)?.mbh === 'portal');
    const switchable = (
      (portal?.features as { subscription_update?: { products?: { product: string; prices: string[] }[] } } | undefined)
        ?.subscription_update?.products ?? []
    );
    if (portal !== undefined && switchable.length > 0) {
      const form: Record<string, string> = {};
      let changed = false;
      switchable.forEach((entry, i) => {
        const prices = entry.product === product ? [priceId] : entry.prices;
        if (entry.product === product && (entry.prices.length !== 1 || entry.prices[0] !== priceId)) changed = true;
        form[`features[subscription_update][products][${i}][product]`] = entry.product;
        prices.forEach((p, j) => (form[`features[subscription_update][products][${i}][prices][${j}]`] = p));
      });
      if (changed) {
        await stripe(`/v1/billing_portal/configurations/${String(portal.id)}`, { method: 'POST', form });
      }
    }

    // 4. Archive the plan's other monthly prices, so only the new one sells.
    const onProduct = (await stripe(`/v1/prices?product=${product}&active=true&limit=100`, { method: 'GET' })) as List;
    for (const old of onProduct.data) {
      if (String(old.id) === priceId) continue;
      if ((old.recurring as { interval?: string } | null | undefined)?.interval !== 'month') continue;
      const meta = old.metadata as Record<string, string> | null | undefined;
      await stripe(`/v1/prices/${String(old.id)}`, {
        method: 'POST',
        form: { active: 'false', ...(meta?.mbh_tier !== tier ? { 'metadata[mbh_tier]': tier } : {}) },
      });
    }

    return { priceId, paymentLink: String(keep.url) };
  }

  // The plan's product, by the metadata provisioning stamped on it.
  private async productFor(tier: PlanTier): Promise<string | undefined> {
    const products = (await this.stripe('/v1/products?active=true&limit=100', { method: 'GET' })) as List;
    const match = products.data.find((p) => (p.metadata as Record<string, string> | undefined)?.mbh_tier === tier);
    return match === undefined ? undefined : String(match.id);
  }
}
