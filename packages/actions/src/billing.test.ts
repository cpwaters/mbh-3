import { describe, expect, it } from 'vitest';
import { AppError, FOUNDER_EMAIL, type BillingEvent } from '@mbh/domain';
import { InMemoryDataStore, MockAuthProvider, MockBillingWebhook, MOCK_WEBHOOK_SIGNATURE } from '@mbh/provider-mocks';
import { buildRegistry } from './registry.js';
import { BILLING_WEBHOOK_PATH, handleHttpRequest, type HttpDispatchDeps } from './http-dispatch.js';
import { makeHarness, makeIdGen, validPostLoadPayload, type Harness } from './test-harness.js';

const NOW = '2026-10-27T12:00:00.000Z';
const founder = { actorId: 'founder-1', email: FOUNDER_EMAIL };

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code);
    return err as AppError;
  }
  throw new Error(`expected an AppError with code ${code}, but the call resolved`);
}

const checkout = (overrides: Partial<Extract<BillingEvent, { kind: 'checkoutCompleted' }>> = {}): BillingEvent => ({
  kind: 'checkoutCompleted',
  eventId: 'evt_checkout',
  createdAt: '2026-10-27T11:00:00.000Z',
  customerId: 'cus_1',
  subscriptionId: 'sub_1',
  tenantId: 'shipper-1',
  ...overrides,
});

const subscription = (
  overrides: Partial<Extract<BillingEvent, { kind: 'subscriptionChanged' }>> = {}
): BillingEvent => ({
  kind: 'subscriptionChanged',
  eventId: 'evt_sub',
  createdAt: '2026-10-27T11:00:01.000Z',
  customerId: 'cus_1',
  subscriptionId: 'sub_1',
  status: 'active',
  tier: 'growth',
  currentPeriodEnd: '2026-11-27T11:00:00.000Z',
  cancelAtPeriodEnd: false,
  ...overrides,
});

async function makeApi(withWebhook = true) {
  const store = new InMemoryDataStore();
  const auth = new MockAuthProvider();
  auth.grant('owner-token', 'ship-owner');
  auth.grant('founder-token', 'founder-1', FOUNDER_EMAIL);
  await store.runBatch([
    { kind: 'create', path: 'tenants/shipper-1', data: { tenantId: 'shipper-1', name: 'Acme', capabilities: ['shipper'] } },
    {
      kind: 'create',
      path: 'tenants/shipper-1/members/ship-owner',
      data: { tenantId: 'shipper-1', actorId: 'ship-owner', role: 'owner', status: 'active', displayName: 'Owner' },
    },
  ]);
  const deps: HttpDispatchDeps = {
    store,
    auth,
    registry: buildRegistry(),
    now: () => NOW,
    newId: makeIdGen(),
    billingWebhook: withWebhook ? new MockBillingWebhook() : null,
  };
  // null = send no signature header at all.
  const webhook = (body: unknown, signature: string | null = MOCK_WEBHOOK_SIGNATURE) =>
    handleHttpRequest(deps, {
      method: 'POST',
      path: BILLING_WEBHOOK_PATH,
      body: null,
      rawBody: JSON.stringify(body),
      ...(signature !== null ? { webhookSignature: signature } : {}),
    });
  return { store, deps, webhook };
}

describe('the billing webhook route', () => {
  it('fails closed before a signing secret exists — nothing is recorded', async () => {
    const { store, webhook } = await makeApi(false);
    const res = await webhook(checkout());
    expect(res.status).toBe(503);
    expect(await store.getDoc('billingCustomers/cus_1')).toBeNull();
  });

  it('refuses an unsigned or wrongly signed body', async () => {
    const { store, webhook } = await makeApi();
    expect((await webhook(checkout(), null)).status).toBe(400);
    expect((await webhook(checkout(), 'forged')).status).toBe(400);
    expect(await store.getDoc('billingCustomers/cus_1')).toBeNull();
  });

  it('acknowledges an event it does not act on with a 2xx, so the provider stops retrying', async () => {
    const { webhook } = await makeApi();
    expect(await webhook({ ignore: 'invoice.paid' })).toMatchObject({ status: 200, body: { ok: true, ignored: 'invoice.paid' } });
  });

  it('records checkout then subscription onto the company, as a system action', async () => {
    const { store, webhook } = await makeApi();
    expect((await webhook(checkout())).status).toBe(200);
    expect((await webhook(subscription())).status).toBe(200);

    const tenant = (await store.getDoc('tenants/shipper-1')) as { billing: Record<string, unknown> };
    expect(tenant.billing).toMatchObject({
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      tier: 'growth',
      status: 'active',
      currentPeriodEnd: '2026-11-27T11:00:00.000Z',
      cancelAtPeriodEnd: false,
      override: null,
    });
    const audit = await store.query({ collection: 'audit', filters: [{ field: 'action', op: '==', value: 'recordBillingEvent' }] });
    expect(audit.map((a) => a.data)).toEqual(
      expect.arrayContaining([expect.objectContaining({ actorId: 'system:billing', source: 'system', stripeEventId: 'evt_sub' })])
    );
  });

  it('gets the same answer when the subscription arrives before the checkout', async () => {
    const { store, webhook } = await makeApi();
    await webhook(subscription());
    // Plan known, company not yet: nothing projected onto any tenant.
    expect(await store.getDoc('tenants/shipper-1')).not.toHaveProperty('billing');
    await webhook(checkout());
    expect(await store.getDoc('tenants/shipper-1')).toMatchObject({ billing: { tier: 'growth', status: 'active' } });
  });

  it('applies a redelivered event once, answering the replay from the marker', async () => {
    const { store, webhook } = await makeApi();
    await webhook(checkout());
    const first = await webhook(subscription());
    const replay = await webhook(subscription());
    expect(replay).toEqual(first);
    const audit = await store.query({ collection: 'audit', filters: [{ field: 'stripeEventId', op: '==', value: 'evt_sub' }] });
    expect(audit).toHaveLength(1);
  });

  it('does not let a late, older event roll the plan back', async () => {
    const { store, webhook } = await makeApi();
    await webhook(checkout());
    await webhook(subscription({ eventId: 'evt_new', createdAt: '2026-10-27T11:05:00.000Z', status: 'canceled' }));
    const res = await webhook(subscription({ eventId: 'evt_old', createdAt: '2026-10-27T11:01:00.000Z', status: 'active' }));
    expect(res.body).toMatchObject({ ok: true, result: { applied: false } });
    expect(await store.getDoc('tenants/shipper-1')).toMatchObject({ billing: { status: 'canceled' } });
  });

  it('records a customer whose reference names no company, but ties it to nothing', async () => {
    const { store, webhook } = await makeApi();
    const res = await webhook(checkout({ tenantId: 'no-such-company' }));
    expect(res.status).toBe(200);
    expect(await store.getDoc('billingCustomers/cus_1')).not.toHaveProperty('tenantId');
  });

  it('keeps the founder’s override when Stripe reports a change', async () => {
    const { store, webhook } = await makeApi();
    await store.runBatch([
      {
        kind: 'update',
        path: 'tenants/shipper-1',
        data: { billing: { override: { tier: 'fleet', note: 'Pilot', setAt: NOW } } },
      },
    ]);
    await webhook(checkout());
    await webhook(subscription({ status: 'canceled' }));
    expect(await store.getDoc('tenants/shipper-1')).toMatchObject({
      billing: { status: 'canceled', override: { tier: 'fleet' } },
    });
  });
});

describe('recordBillingEvent is the system’s alone', () => {
  it('refuses it through POST /api/dispatch — even from the founder', async () => {
    const { deps, store } = await makeApi();
    for (const token of ['owner-token', 'founder-token']) {
      const res = await handleHttpRequest(deps, {
        method: 'POST',
        path: '/api/dispatch',
        authorization: `Bearer ${token}`,
        body: { type: 'recordBillingEvent', payload: checkout(), requestId: `r-${token}` },
      });
      expect(res.status).toBe(403);
    }
    expect(await store.getDoc('billingCustomers/cus_1')).toBeNull();
  });
});

async function enforce(h: Harness, links: Record<string, string> = { starter: 'https://buy.stripe.com/test_starter' }) {
  await h.run(founder, {
    type: 'setBillingConfig',
    payload: {
      enforced: true,
      paymentLinks: { starter: '', growth: '', fleet: '', ...links },
      portalUrl: '',
      monthlyPricePence: {},
    },
    requestId: `r-config-${Math.random()}`,
  });
}

const post = (h: Harness, requestId: string, actor = 'ship-owner') =>
  h.run(actor, { type: 'postLoad', payload: validPostLoadPayload(), requestId });

describe('the load allowance', () => {
  it('does not bite until the founder switches enforcement on', async () => {
    const h = await makeHarness();
    for (let i = 0; i < 5; i += 1) await post(h, `r-${i}`);
  });

  it('stops a free shipper at three loads a month, and says how to get more', async () => {
    const h = await makeHarness();
    await enforce(h);
    for (let i = 0; i < 3; i += 1) await post(h, `r-${i}`);
    const err = await expectAppError(post(h, 'r-4'), 'forbidden');
    expect(err.message).toMatch(/3 free loads.*Billing/);
  });

  it('counts a cancelled load, so post-and-cancel is not a way round it', async () => {
    const h = await makeHarness();
    await enforce(h);
    const posted: string[] = [];
    for (let i = 0; i < 3; i += 1) posted.push(((await post(h, `r-${i}`)) as { loadId: string }).loadId);
    await h.run('ship-owner', {
      type: 'cancelLoad',
      payload: { shipperTenantId: 'shipper-1', loadId: posted[0] },
      requestId: 'r-cancel',
    });
    await expectAppError(post(h, 'r-4'), 'forbidden');
  });

  it('lets a plan the founder gave carry on past the free allowance', async () => {
    const h = await makeHarness();
    await enforce(h);
    await h.run(founder, {
      type: 'setCompanyPlan',
      payload: { tenantId: 'shipper-1', tier: 'fleet', note: 'Pilot customer' },
      requestId: 'r-plan',
    });
    for (let i = 0; i < 6; i += 1) await post(h, `r-${i}`);
    expect(await h.store.getDoc('tenants/shipper-1')).toMatchObject({
      billing: { override: { tier: 'fleet', note: 'Pilot customer' } },
    });
  });
});

describe('setBillingConfig', () => {
  it('is the founder’s alone', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run('ship-owner', {
        type: 'setBillingConfig',
        payload: { enforced: false, paymentLinks: { starter: '', growth: '', fleet: '' }, portalUrl: '', monthlyPricePence: {} },
        requestId: 'r-1',
      }),
      'forbidden'
    );
  });

  it('will not enforce plans while there is nowhere to pay', async () => {
    const h = await makeHarness();
    const err = await expectAppError(enforce(h, {}), 'invalid-payload');
    expect(err.message).toMatch(/payment link/);
  });

  it('refuses a link that is not Stripe’s, so a typo cannot send shippers elsewhere', async () => {
    const h = await makeHarness();
    await expectAppError(enforce(h, { starter: 'https://buy.stripe.com.evil.test/x' }), 'invalid-payload');
  });

  it('stores only the links that were given', async () => {
    const h = await makeHarness();
    await enforce(h, { growth: 'https://buy.stripe.com/test_growth' });
    expect(await h.store.getDoc('platformConfig/billing')).toMatchObject({
      enforced: true,
      paymentLinks: { growth: 'https://buy.stripe.com/test_growth' },
    });
  });
});

describe('setCompanyPlan', () => {
  it('is the founder’s alone', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run('ship-owner', { type: 'setCompanyPlan', payload: { tenantId: 'shipper-1', tier: 'fleet' }, requestId: 'r-1' }),
      'forbidden'
    );
  });

  it('refuses a carrier-only company — carrying is free', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run(founder, { type: 'setCompanyPlan', payload: { tenantId: 'carrier-1', tier: 'fleet' }, requestId: 'r-1' }),
      'conflict'
    );
  });

  it('removes an override, returning the company to what it pays for', async () => {
    const h = await makeHarness();
    await h.run(founder, { type: 'setCompanyPlan', payload: { tenantId: 'shipper-1', tier: 'growth' }, requestId: 'r-1' });
    await h.run(founder, { type: 'setCompanyPlan', payload: { tenantId: 'shipper-1', tier: null }, requestId: 'r-2' });
    expect(await h.store.getDoc('tenants/shipper-1')).toMatchObject({ billing: { override: null } });
  });
});
