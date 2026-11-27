import { describe, expect, it } from 'vitest';
import { AppError, FOUNDER_EMAIL, MAX_OUTBOX_ATTEMPTS } from '@mbh/domain';
import {
  InMemoryGeocoder,
  InMemoryMailer,
  InMemoryObjectStorage,
  InMemoryPlanCatalog,
  InMemoryRouteProvider,
} from '@mbh/provider-mocks';
import { runDrainOnce, type DrainDeps } from './drain.js';
import { makeHarness, type Harness } from './test-harness.js';

// The founder sets a plan's price in the back office; the drain makes it so
// at Stripe and writes the new payment link back onto the billing settings.

const founder = { actorId: 'founder-1', email: FOUNDER_EMAIL };
let request = 0;

const setPrice = (h: Harness, tier: string, pence: number, actor: string | typeof founder = founder) =>
  h.run(actor, { type: 'setPlanPrice', payload: { tier, pence }, requestId: `r-price-${++request}` });

function drainDeps(h: Harness, planCatalog: InMemoryPlanCatalog | null): DrainDeps {
  let n = 0;
  return {
    store: h.store,
    geocoder: new InMemoryGeocoder(),
    routeProvider: new InMemoryRouteProvider(),
    mailer: new InMemoryMailer(),
    objectStorage: new InMemoryObjectStorage(),
    planCatalog,
    now: () => '2026-11-27T12:00:00.000Z',
    newId: (prefix: string) => `${prefix}-drain-${++n}`,
  };
}

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e
  );
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  return err as AppError;
}

describe('setPlanPrice', () => {
  it('is the founder’s alone', async () => {
    const h = await makeHarness();
    await expectAppError(setPrice(h, 'growth', 9_900, 'ship-owner'), 'forbidden');
  });

  it('refuses a price under £1 or over £10,000 a month, and a plan that does not exist', async () => {
    const h = await makeHarness();
    await expectAppError(setPrice(h, 'growth', 50), 'invalid-payload');
    await expectAppError(setPrice(h, 'growth', 1_000_001), 'invalid-payload');
    await expectAppError(setPrice(h, 'growth', 99.5), 'invalid-payload');
    await expectAppError(setPrice(h, 'platinum', 9_900), 'invalid-payload');
  });

  it('queues the change for Stripe without changing what the plan sells at yet', async () => {
    const h = await makeHarness();
    await setPrice(h, 'growth', 9_900);
    expect(await h.store.getDoc('platformConfig/planPrices')).toMatchObject({
      growth: { pence: 9_900, status: 'pending' },
    });
    const tasks = await h.store.query({ collection: 'outbox', filters: [{ field: 'type', op: '==', value: 'syncPlanPrice' }] });
    expect(tasks.map((t) => t.data)).toEqual([expect.objectContaining({ tier: 'growth', pence: 9_900, status: 'pending' })]);
    expect(await h.store.getDoc('platformConfig/billing')).toBeNull();
  });

  it('will not start a second change to a plan while the first is still going through', async () => {
    const h = await makeHarness();
    await setPrice(h, 'growth', 9_900);
    const err = await expectAppError(setPrice(h, 'growth', 8_900), 'conflict');
    expect(err.message).toMatch(/still changing/);
    await setPrice(h, 'fleet', 24_900); // a different plan is fine
  });
});

describe('the drain — syncPlanPrice', () => {
  it('changes the price at Stripe and puts the new link and price on the billing settings', async () => {
    const h = await makeHarness();
    await h.run(founder, {
      type: 'setBillingConfig',
      payload: {
        enforced: true,
        paymentLinks: { starter: 'https://buy.stripe.com/test_starter', growth: 'https://buy.stripe.com/test_old_growth', fleet: '' },
        portalUrl: 'https://billing.stripe.com/p/login/test_p',
        monthlyPricePence: { starter: 4_900, growth: 12_900 },
      },
      requestId: 'r-config',
    });
    await setPrice(h, 'growth', 9_900);

    const catalog = new InMemoryPlanCatalog();
    const summary = await runDrainOnce(drainDeps(h, catalog));
    expect(summary.priced).toBe(1);
    expect(catalog.calls).toEqual([{ tier: 'growth', pence: 9_900 }]);

    expect(await h.store.getDoc('platformConfig/billing')).toMatchObject({
      enforced: true,
      portalUrl: 'https://billing.stripe.com/p/login/test_p',
      paymentLinks: { starter: 'https://buy.stripe.com/test_starter', growth: 'https://buy.stripe.com/test_mock_growth_1' },
      monthlyPricePence: { starter: 4_900, growth: 9_900 },
    });
    expect(await h.store.getDoc('platformConfig/planPrices')).toMatchObject({
      growth: { pence: 9_900, status: 'done', priceId: 'price_mock_1', paymentLink: 'https://buy.stripe.com/test_mock_growth_1' },
    });
    const audit = await h.store.query({ collection: 'audit', filters: [{ field: 'action', op: '==', value: 'syncPlanPrice' }] });
    expect(audit.map((a) => a.data)).toEqual([expect.objectContaining({ source: 'system', tier: 'growth', pence: 9_900 })]);

    // Done, so the next change to the plan is allowed.
    await setPrice(h, 'growth', 10_900);
  });

  it('keeps the stored prices when the settings are saved without them', async () => {
    const h = await makeHarness();
    await setPrice(h, 'growth', 9_900);
    await runDrainOnce(drainDeps(h, new InMemoryPlanCatalog()));
    await h.run(founder, {
      type: 'setBillingConfig',
      payload: { enforced: false, paymentLinks: { starter: '', growth: 'https://buy.stripe.com/test_mock_growth_1', fleet: '' }, portalUrl: '' },
      requestId: 'r-config-2',
    });
    expect(await h.store.getDoc('platformConfig/billing')).toMatchObject({ monthlyPricePence: { growth: 9_900 } });
  });

  it('tries again next minute when Stripe has a hiccup', async () => {
    const h = await makeHarness();
    await setPrice(h, 'growth', 9_900);
    const catalog = new InMemoryPlanCatalog().failOnce('Stripe is having a moment');
    expect((await runDrainOnce(drainDeps(h, catalog))).retried).toBe(1);
    expect(await h.store.getDoc('platformConfig/planPrices')).toMatchObject({ growth: { status: 'pending' } });
    expect((await runDrainOnce(drainDeps(h, catalog))).priced).toBe(1);
  });

  it('says why when Stripe refuses, and lets the founder try again', async () => {
    const h = await makeHarness();
    await setPrice(h, 'growth', 9_900);
    const catalog = new InMemoryPlanCatalog().failOnce('Stripe has no price for Growth yet', false);
    expect((await runDrainOnce(drainDeps(h, catalog))).failed).toBe(1);
    expect(await h.store.getDoc('platformConfig/planPrices')).toMatchObject({
      growth: { pence: 9_900, status: 'failed', lastError: 'Stripe has no price for Growth yet' },
    });
    expect(await h.store.getDoc('platformConfig/billing')).toBeNull();
    await setPrice(h, 'growth', 9_900);
  });

  it('gives up after the last attempt', async () => {
    const h = await makeHarness();
    await setPrice(h, 'growth', 9_900);
    const catalog = new InMemoryPlanCatalog();
    for (let i = 0; i < MAX_OUTBOX_ATTEMPTS; i++) {
      catalog.failOnce('still down');
      await runDrainOnce(drainDeps(h, catalog));
    }
    expect(await h.store.getDoc('platformConfig/planPrices')).toMatchObject({ growth: { status: 'failed', lastError: 'still down' } });
  });

  it('fails with the reason when the server has no Stripe key', async () => {
    const h = await makeHarness();
    await setPrice(h, 'growth', 9_900);
    expect((await runDrainOnce(drainDeps(h, null))).failed).toBe(1);
    expect(await h.store.getDoc('platformConfig/planPrices')).toMatchObject({
      growth: { status: 'failed', lastError: expect.stringMatching(/STRIPE_SECRET_KEY/) },
    });
  });
});
