import { describe, expect, it } from 'vitest';
import { PlanCatalogError } from '@mbh/provider-interfaces';
import { StripePlanCatalog } from './stripe-plan-catalog.js';
import type { StripeFetch } from './stripe-rest.js';

// A small fake of the Stripe endpoints a price change touches, seeded with
// what provisioning leaves behind for two plans.
type Obj = Record<string, unknown>;

function fakeStripe() {
  let n = 0;
  const id = (p: string) => `${p}_${++n}`;
  const prices: Obj[] = [
    { id: 'price_growth_1', product: 'prod_growth', currency: 'gbp', unit_amount: 12_900, recurring: { interval: 'month' }, lookup_key: 'mbh_growth_monthly', active: true, metadata: { mbh_tier: 'growth' } },
    { id: 'price_fleet_1', product: 'prod_fleet', currency: 'gbp', unit_amount: 29_900, recurring: { interval: 'month' }, lookup_key: 'mbh_fleet_monthly', active: true, metadata: { mbh_tier: 'fleet' } },
  ];
  const links: Obj[] = [
    { id: 'plink_growth_1', url: 'https://buy.stripe.com/test_growth_1', active: true, price: 'price_growth_1', metadata: { mbh_tier: 'growth' } },
    { id: 'plink_fleet_1', url: 'https://buy.stripe.com/test_fleet_1', active: true, price: 'price_fleet_1', metadata: { mbh_tier: 'fleet' } },
  ];
  const portal: Obj = {
    id: 'bpc_1',
    metadata: { mbh: 'portal' },
    features: {
      subscription_update: {
        products: [
          { product: 'prod_growth', prices: ['price_growth_1'] },
          { product: 'prod_fleet', prices: ['price_fleet_1'] },
        ],
      },
    },
  };
  const posts: string[] = [];
  let failOn: string | null = null;

  const stripe: StripeFetch = async (path, { method, form = {} }) => {
    if (failOn !== null && path.startsWith(failOn)) {
      failOn = null;
      throw Object.assign(new Error('Stripe is having a moment (500)'), { status: 500 });
    }
    if (method === 'GET') {
      const key = /lookup_keys\[\]=([^&]+)/.exec(path)?.[1];
      if (key !== undefined) return { data: prices.filter((p) => p.lookup_key === key && p.active) };
      const product = /\/v1\/prices\?product=([^&]+)/.exec(path)?.[1];
      if (product !== undefined) return { data: prices.filter((p) => p.product === product && p.active) };
      const items = /^\/v1\/payment_links\/([^/]+)\/line_items/.exec(path);
      if (items) return { data: [{ price: { id: links.find((l) => l.id === items[1])?.price } }] };
      if (path.startsWith('/v1/payment_links')) return { data: links.filter((l) => l.active) };
      if (path.startsWith('/v1/billing_portal/configurations')) return { data: [portal] };
      throw new Error(`unexpected GET ${path}`);
    }
    posts.push(path);
    if (path === '/v1/prices') {
      if (form.transfer_lookup_key === 'true') for (const p of prices) if (p.lookup_key === form.lookup_key) p.lookup_key = null;
      const p: Obj = {
        id: id('price_new'),
        product: form.product,
        currency: form.currency,
        unit_amount: Number(form.unit_amount),
        recurring: { interval: form['recurring[interval]'] },
        lookup_key: form.lookup_key,
        active: true,
        metadata: { mbh_tier: form['metadata[mbh_tier]'] },
      };
      prices.push(p);
      return p;
    }
    const priceUpdate = /^\/v1\/prices\/([^/]+)$/.exec(path);
    if (priceUpdate) {
      const p = prices.find((x) => x.id === priceUpdate[1]);
      if (p === undefined) throw new Error('no such price');
      if (form.active === 'false') p.active = false;
      if (form['metadata[mbh_tier]'] !== undefined) p.metadata = { mbh_tier: form['metadata[mbh_tier]'] };
      return p;
    }
    if (path === '/v1/payment_links') {
      const linkId = id('plink');
      const l: Obj = {
        id: linkId,
        url: `https://buy.stripe.com/test_${linkId}`,
        active: true,
        price: form['line_items[0][price]'],
        metadata: { mbh_tier: form['metadata[mbh_tier]'] },
        redirect: form['after_completion[redirect][url]'],
      };
      links.push(l);
      return l;
    }
    const linkUpdate = /^\/v1\/payment_links\/([^/]+)$/.exec(path);
    if (linkUpdate) {
      const l = links.find((x) => x.id === linkUpdate[1]);
      if (l !== undefined && form.active === 'false') l.active = false;
      return l ?? {};
    }
    if (path === '/v1/billing_portal/configurations/bpc_1') {
      const products: { product: string; prices: string[] }[] = [];
      for (const [k, v] of Object.entries(form)) {
        const m = /products\]\[(\d+)\]\[(product|prices)\](?:\[(\d+)\])?/.exec(k);
        if (!m) continue;
        const i = Number(m[1]);
        products[i] ??= { product: '', prices: [] };
        if (m[2] === 'product') products[i].product = v;
        else products[i].prices[Number(m[3])] = v;
      }
      (portal.features as { subscription_update: { products: unknown } }).subscription_update.products = products;
      return portal;
    }
    throw new Error(`unexpected POST ${path}`);
  };

  return {
    stripe,
    prices,
    links,
    portal,
    posts,
    failNextAt: (prefix: string) => {
      failOn = prefix;
    },
  };
}

const SITE = 'https://mybackhaul-app.web.app';

describe('StripePlanCatalog.setMonthlyPrice', () => {
  it('sells the plan at the new price through a new link, and stops selling the old one', async () => {
    const fake = fakeStripe();
    const result = await new StripePlanCatalog(fake.stripe, SITE).setMonthlyPrice('growth', 9_900);

    const current = fake.prices.filter((p) => p.lookup_key === 'mbh_growth_monthly');
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ id: result.priceId, unit_amount: 9_900, product: 'prod_growth', active: true });

    // The old price is archived but still names its plan, so its subscribers keep it.
    expect(fake.prices.find((p) => p.id === 'price_growth_1')).toMatchObject({
      active: false,
      lookup_key: null,
      metadata: { mbh_tier: 'growth' },
    });

    const active = fake.links.filter((l) => l.active && (l.metadata as Obj).mbh_tier === 'growth');
    expect(active).toEqual([expect.objectContaining({ url: result.paymentLink, price: result.priceId })]);
    expect(active[0]?.redirect).toBe(`${SITE}/app/billing?checkout=done`);
    expect(fake.links.find((l) => l.id === 'plink_growth_1')?.active).toBe(false);

    expect((fake.portal.features as { subscription_update: { products: unknown } }).subscription_update.products).toEqual([
      { product: 'prod_growth', prices: [result.priceId] },
      { product: 'prod_fleet', prices: ['price_fleet_1'] },
    ]);
  });

  it('leaves the other plans alone', async () => {
    const fake = fakeStripe();
    await new StripePlanCatalog(fake.stripe, SITE).setMonthlyPrice('growth', 9_900);
    expect(fake.prices.find((p) => p.id === 'price_fleet_1')).toMatchObject({ active: true, lookup_key: 'mbh_fleet_monthly' });
    expect(fake.links.find((l) => l.id === 'plink_fleet_1')?.active).toBe(true);
  });

  it('changes nothing when the price is already what was asked', async () => {
    const fake = fakeStripe();
    const result = await new StripePlanCatalog(fake.stripe, SITE).setMonthlyPrice('growth', 12_900);
    expect(result).toEqual({ priceId: 'price_growth_1', paymentLink: 'https://buy.stripe.com/test_growth_1' });
    expect(fake.posts).toEqual([]);
  });

  it('finishes a change that died part-way, without making a second price or link', async () => {
    const fake = fakeStripe();
    const catalog = new StripePlanCatalog(fake.stripe, SITE);
    fake.failNextAt('/v1/billing_portal/configurations/'); // after the price and link were made
    await expect(catalog.setMonthlyPrice('growth', 9_900)).rejects.toMatchObject({ recoverable: true });

    const result = await catalog.setMonthlyPrice('growth', 9_900);
    expect(fake.prices.filter((p) => p.unit_amount === 9_900)).toHaveLength(1);
    expect(fake.links.filter((l) => l.active && (l.metadata as Obj).mbh_tier === 'growth')).toHaveLength(1);
    expect(fake.prices.find((p) => p.id === 'price_growth_1')?.active).toBe(false);
    expect(result.paymentLink).toBe(fake.links.find((l) => l.price === result.priceId)?.url);
  });

  it('gives up, without retrying, on a plan Stripe has never been set up for', async () => {
    const fake = fakeStripe();
    const err = await new StripePlanCatalog(fake.stripe, SITE).setMonthlyPrice('driver_pro', 2_000).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlanCatalogError);
    expect(err).toMatchObject({ recoverable: false, message: expect.stringMatching(/stripe:provision/) });
  });
});
