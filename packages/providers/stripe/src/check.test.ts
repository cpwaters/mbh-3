import { describe, expect, it } from 'vitest';
import { PLAN_LOOKUP_KEYS, PLAN_TIERS, type PlanTier } from '@mbh/domain';
import { audit, formatReport, REQUIRED_WEBHOOK_EVENTS } from './check.js';
import type { StripeFetch } from './provision.js';

const SITE = 'https://example.test';

const price = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  currency: 'gbp',
  unit_amount: 999,
  recurring: { interval: 'month', interval_count: 1 },
  lookup_key: null,
  product: { name: `Product ${id}` },
  ...extra,
});

const tagged = (tier: PlanTier, unit_amount = 999) =>
  price(`price_${tier}`, { lookup_key: PLAN_LOOKUP_KEYS[tier], unit_amount });

function fakeAccount(account: {
  prices: Record<string, unknown>[];
  links: { id: string; url: string; price: Record<string, unknown>; after_completion?: unknown }[];
  webhooks: Record<string, unknown>[];
  portals: Record<string, unknown>[];
}): { stripe: StripeFetch; writes: string[] } {
  const writes: string[] = [];
  const stripe: StripeFetch = async (path, { method }) => {
    if (method !== 'GET') {
      writes.push(path);
      return {};
    }
    if (path.startsWith('/v1/prices')) return { data: account.prices };
    const items = /^\/v1\/payment_links\/([^/]+)\/line_items/.exec(path);
    if (items) return { data: [{ price: account.links.find((l) => l.id === items[1])?.price }] };
    if (path.startsWith('/v1/payment_links')) return { data: account.links };
    if (path.startsWith('/v1/webhook_endpoints')) return { data: account.webhooks };
    if (path.startsWith('/v1/billing_portal')) return { data: account.portals };
    throw new Error(`unexpected ${path}`);
  };
  return { stripe, writes };
}

const back = { type: 'redirect', redirect: { url: `${SITE}/app/billing?checkout=done` } };
const webhook = { url: `${SITE}/api/billing/webhook`, status: 'enabled', enabled_events: REQUIRED_WEBHOOK_EVENTS };
const portal = { login_page: { enabled: true, url: 'https://billing.stripe.com/p/login/test_x' } };

describe('stripe:check', () => {
  it('passes an account set up the way the backend expects, and hands back what to paste', async () => {
    const prices = PLAN_TIERS.map((t) => tagged(t));
    const links = PLAN_TIERS.map((t) => ({
      id: `plink_${t}`,
      url: `https://buy.stripe.com/${t}`,
      price: tagged(t),
      after_completion: back,
    }));
    const { stripe, writes } = fakeAccount({ prices, links, webhooks: [webhook], portals: [portal] });

    const report = await audit(stripe, SITE, 'test');

    expect(report.findings.filter((f) => f.severity === 'problem')).toEqual([]);
    expect(report.paymentLinks.driver_pro).toBe('https://buy.stripe.com/driver_pro');
    expect(report.portalUrl).toBe('https://billing.stripe.com/p/login/test_x');
    expect(formatReport(report)).toContain('Everything the backend needs is in place.');
    // Read-only: nothing is ever written.
    expect(writes).toEqual([]);
  });

  it('finds what a hand-made setup typically gets wrong', async () => {
    // A link per plan made in the dashboard: prices without lookup keys, one
    // sold as a one-off, no webhook, no portal login page.
    const untagged = price('price_hand', { unit_amount: 4900 });
    const oneOff = price('price_once', { recurring: null, unit_amount: 999 });
    const { stripe } = fakeAccount({
      prices: [untagged, oneOff],
      links: [
        { id: 'plink_a', url: 'https://buy.stripe.com/a', price: untagged },
        { id: 'plink_b', url: 'https://buy.stripe.com/b', price: oneOff },
      ],
      webhooks: [],
      portals: [{ login_page: { enabled: false } }],
    });

    const report = await audit(stripe, SITE, 'live');
    const text = formatReport(report);

    expect(text).toMatch(/Starter: no price tagged mbh_starter_monthly/);
    expect(text).toMatch(/Untagged subscription price: Product price_hand £49\.00\/month/);
    expect(text).toMatch(/https:\/\/buy\.stripe\.com\/b sells a one-off price/);
    expect(text).toMatch(/https:\/\/buy\.stripe\.com\/a sells an untagged price/);
    expect(text).toMatch(/No webhook endpoint at https:\/\/example\.test\/api\/billing\/webhook/);
    expect(text).toMatch(/Customer portal login page is off/);
    expect(text).toMatch(/pnpm stripe:provision/);
    expect(report.paymentLinks).toEqual({});
  });

  it('flags a non-monthly price and a webhook missing events', async () => {
    const yearly = tagged('starter');
    (yearly as Record<string, unknown>).recurring = { interval: 'year', interval_count: 1 };
    const { stripe } = fakeAccount({
      prices: [yearly],
      links: [],
      webhooks: [{ ...webhook, enabled_events: ['checkout.session.completed'] }],
      portals: [portal],
    });
    const text = formatReport(await audit(stripe, SITE, 'test'));
    expect(text).toMatch(/Starter: price is not monthly/);
    expect(text).toMatch(/missing events: customer\.subscription\.created/);
  });
});
