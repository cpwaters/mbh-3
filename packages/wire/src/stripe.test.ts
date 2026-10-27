import { describe, expect, it } from 'vitest';
import { parseStripeEvent } from './stripe.js';

const created = 1_793_000_000; // 2026-10-26T…Z
const createdIso = new Date(created * 1000).toISOString();

const subscriptionEvent = (type: string, overrides: Record<string, unknown> = {}) => ({
  id: 'evt_sub',
  type,
  created,
  data: {
    object: {
      id: 'sub_1',
      object: 'subscription',
      customer: 'cus_1',
      status: 'active',
      cancel_at_period_end: false,
      items: { data: [{ current_period_end: created + 30 * 86400, price: { id: 'price_1', lookup_key: 'mbh_growth_monthly' } }] },
      ...overrides,
    },
  },
});

describe('parseStripeEvent', () => {
  it('ties a completed subscription checkout to the company in client_reference_id', () => {
    const outcome = parseStripeEvent({
      id: 'evt_1',
      type: 'checkout.session.completed',
      created,
      data: { object: { mode: 'subscription', client_reference_id: 'tenant-1', customer: 'cus_1', subscription: 'sub_1', extra: 1 } },
    });
    expect(outcome).toEqual({
      ok: true,
      event: { kind: 'checkoutCompleted', eventId: 'evt_1', createdAt: createdIso, customerId: 'cus_1', subscriptionId: 'sub_1', tenantId: 'tenant-1' },
    });
  });

  it('ignores a checkout with no company attached, rather than failing it for Stripe to retry forever', () => {
    const outcome = parseStripeEvent({
      id: 'evt_2',
      type: 'checkout.session.completed',
      created,
      data: { object: { mode: 'subscription', client_reference_id: null, customer: 'cus_1', subscription: 'sub_1' } },
    });
    expect(outcome).toEqual({ ok: true, ignored: 'checkout without a company reference' });
  });

  it('reads the tier from the price lookup key and the period end from the item', () => {
    const outcome = parseStripeEvent(subscriptionEvent('customer.subscription.updated'));
    expect(outcome).toMatchObject({
      ok: true,
      event: {
        kind: 'subscriptionChanged',
        customerId: 'cus_1',
        subscriptionId: 'sub_1',
        status: 'active',
        tier: 'growth',
        currentPeriodEnd: new Date((created + 30 * 86400) * 1000).toISOString(),
        cancelAtPeriodEnd: false,
      },
    });
  });

  it('treats a deleted subscription as canceled whatever status it last carried', () => {
    const outcome = parseStripeEvent(subscriptionEvent('customer.subscription.deleted', { status: 'active' }));
    expect(outcome).toMatchObject({ ok: true, event: { status: 'canceled' } });
  });

  it('fails closed on a status it does not know, and on a price it does not know', () => {
    const outcome = parseStripeEvent(
      subscriptionEvent('customer.subscription.updated', {
        status: 'some_new_status',
        items: { data: [{ price: { id: 'price_x', lookup_key: 'someone_elses_price' } }] },
      })
    );
    expect(outcome).toMatchObject({ ok: true, event: { status: 'incomplete', tier: null } });
  });

  it('acknowledges events it does not act on', () => {
    expect(parseStripeEvent({ id: 'evt_3', type: 'invoice.paid', created, data: { object: {} } })).toEqual({
      ok: true,
      ignored: 'invoice.paid',
    });
  });

  it('refuses a body that is not a Stripe event', () => {
    expect(parseStripeEvent({ hello: 'world' }).ok).toBe(false);
    expect(parseStripeEvent(subscriptionEvent('customer.subscription.updated', { customer: 42 })).ok).toBe(false);
  });
});
