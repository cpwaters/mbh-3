import { describe, expect, it } from 'vitest';
import { DEFAULT_MONTHLY_PENCE, encodeForm, provision, type StripeFetch } from './provision.js';

// A small fake of the Stripe endpoints provisioning touches — enough to prove
// a first run creates everything and a second run creates nothing.
function fakeStripe() {
  const store = {
    products: [] as Record<string, unknown>[],
    prices: [] as Record<string, unknown>[],
    links: [] as Record<string, unknown>[],
    portals: [] as Record<string, unknown>[],
    webhooks: [] as Record<string, unknown>[],
  };
  const posts: string[] = [];
  let n = 0;
  const id = (p: string) => `${p}_${++n}`;
  const meta = (form: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(form)
        .filter(([k]) => k.startsWith('metadata['))
        .map(([k, v]) => [k.slice(9, -1), v])
    );

  const stripe: StripeFetch = async (path, { method, form = {} }) => {
    if (method === 'POST') posts.push(path);
    if (method === 'GET') {
      if (path.startsWith('/v1/prices')) {
        const key = /lookup_keys\[\]=([^&]+)/.exec(path)?.[1];
        return { data: store.prices.filter((p) => p.lookup_key === key) };
      }
      if (path.startsWith('/v1/payment_links')) return { data: store.links };
      if (path.startsWith('/v1/billing_portal')) return { data: store.portals };
      if (path.startsWith('/v1/webhook_endpoints')) return { data: store.webhooks };
    }
    if (path === '/v1/products') {
      const p = { id: id('prod') };
      store.products.push(p);
      return p;
    }
    if (path === '/v1/prices') {
      const p = { id: id('price'), product: form.product, lookup_key: form.lookup_key, unit_amount: Number(form.unit_amount) };
      store.prices.push(p);
      return p;
    }
    if (path === '/v1/payment_links') {
      const l = { id: id('plink'), url: `https://buy.stripe.com/test_${n}`, metadata: meta(form) };
      store.links.push(l);
      return l;
    }
    if (path.startsWith('/v1/billing_portal/configurations')) {
      const existing = store.portals.find((p) => path.endsWith(p.id as string));
      if (existing) return existing;
      const p = { id: id('bpc'), metadata: meta(form), login_page: { url: 'https://billing.stripe.com/p/login/test_x' } };
      store.portals.push(p);
      return p;
    }
    if (path.startsWith('/v1/webhook_endpoints')) {
      const existing = store.webhooks.find((w) => path.endsWith(w.id as string));
      if (existing) return existing;
      const w = { id: id('we'), url: form.url, secret: 'whsec_fake' };
      store.webhooks.push(w);
      return w;
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { stripe, store, posts };
}

const options = { siteUrl: 'https://example.test', monthlyPence: DEFAULT_MONTHLY_PENCE, log: () => undefined };

describe('provision', () => {
  it('creates a price per tier tagged with the lookup key the webhook reads, plus links, portal and webhook', async () => {
    const { stripe, store } = fakeStripe();
    const result = await provision(stripe, options);

    expect(store.prices.map((p) => p.lookup_key)).toEqual([
      'mbh_starter_monthly',
      'mbh_growth_monthly',
      'mbh_fleet_monthly',
      'mbh_driver_monthly',
    ]);
    expect(Object.values(result.paymentLinks)).toHaveLength(4);
    expect(result.portalUrl).toBe('https://billing.stripe.com/p/login/test_x');
    expect(store.webhooks[0]?.url).toBe('https://example.test/api/billing/webhook');
    expect(result.webhook).toMatchObject({ created: true, secret: 'whsec_fake' });
  });

  it('changes nothing on a second run, and does not claim to know the secret again', async () => {
    const { stripe, store, posts } = fakeStripe();
    await provision(stripe, options);
    const firstPosts = posts.length;
    const again = await provision(stripe, options);

    expect(store.prices).toHaveLength(4);
    expect(store.links).toHaveLength(4);
    expect(store.webhooks).toHaveLength(1);
    // Only the two in-place updates (portal settings, webhook events) post again.
    expect(posts.slice(firstPosts)).toEqual([`/v1/billing_portal/configurations/${store.portals[0]?.id as string}`, `/v1/webhook_endpoints/${store.webhooks[0]?.id as string}`]);
    expect(again.webhook).toEqual({ id: store.webhooks[0]?.id, created: false, secret: null });
  });
});

describe('encodeForm', () => {
  it('encodes Stripe’s bracketed keys and the values', () => {
    expect(encodeForm({ 'line_items[0][price]': 'price_1', url: 'https://x.test/a?b=c' })).toBe(
      'line_items%5B0%5D%5Bprice%5D=price_1&url=https%3A%2F%2Fx.test%2Fa%3Fb%3Dc'
    );
  });
});
