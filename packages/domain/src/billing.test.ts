import { describe, expect, it } from 'vitest';
import {
  checkAcceptAllowed,
  checkLoadAllowance,
  effectivePlan,
  normalizeTier,
  PICKUP_ALLOWANCE,
  type PlanSubject,
  ukDayStart,
  trialDaysLeft,
  trialEndsAt,
  isStripePaymentLink,
  isStripePortalUrl,
  monthStartUtc,
  paymentLinkFor,
  tierFromLookupKey,
  activeOverride,
  freePlanExpiry,
} from './billing.js';

const NOW = '2026-10-27T12:00:00.000Z';
// A company well past any trial, so only its plan decides.
const old = { createdAt: '2026-01-01T00:00:00.000Z' };
const plan = (billing: Parameters<typeof effectivePlan>[0]['billing']) => effectivePlan({ ...old, billing }, NOW);

describe('effectivePlan', () => {
  it('is free with no billing at all, once the trial is over', () => {
    expect(plan(undefined)).toBe('free');
    expect(plan({})).toBe('free');
  });

  it('is the paid tier while Stripe says the subscription is good', () => {
    expect(plan({ tier: 'growth', status: 'active' })).toBe('growth');
    expect(plan({ tier: 'driver_fleet', status: 'trialing' })).toBe('driver_fleet');
  });

  it('keeps the plan while a renewal is being retried, and drops it once Stripe gives up', () => {
    expect(plan({ tier: 'starter', status: 'past_due' })).toBe('starter');
    expect(plan({ tier: 'starter', status: 'unpaid' })).toBe('free');
    expect(plan({ tier: 'starter', status: 'canceled' })).toBe('free');
    expect(plan({ tier: 'starter', status: 'incomplete' })).toBe('free');
  });

  it('lets the founder’s override outrank Stripe, either way', () => {
    const override = { tier: 'fleet' as const, note: 'Pilot customer', setAt: '2026-10-01T00:00:00.000Z' };
    expect(plan({ tier: 'starter', status: 'canceled', override })).toBe('fleet');
    expect(plan({ override })).toBe('fleet');
    expect(plan({ tier: 'growth', status: 'active', override: null })).toBe('growth');
  });

  it('is the trial for 30 days from sign-up, and free after', () => {
    const signedUp = { createdAt: '2026-10-20T12:00:00.000Z', trialEndsAt: '2026-11-19T12:00:00.000Z' };
    expect(effectivePlan(signedUp, NOW)).toBe('trial');
    expect(trialDaysLeft(signedUp, NOW)).toBe(23);
    expect(effectivePlan(signedUp, '2026-11-19T12:00:00.000Z')).toBe('free');
    expect(trialDaysLeft(signedUp, '2026-11-20T00:00:00.000Z')).toBe(0);
  });

  it('gives a company from before trials existed 30 days from when it was created', () => {
    expect(trialEndsAt({ createdAt: '2026-10-01T00:00:00.000Z' })).toBe('2026-10-31T00:00:00.000Z');
    expect(trialEndsAt({})).toBeNull();
  });

  it('stretches a trial stamped with the old 14 days to the full 30', () => {
    const stampedShort = { createdAt: '2026-10-20T12:00:00.000Z', trialEndsAt: '2026-11-03T12:00:00.000Z' };
    expect(trialEndsAt(stampedShort)).toBe('2026-11-19T12:00:00.000Z');
    // ...but never shortens one stamped longer.
    expect(trialEndsAt({ ...stampedShort, trialEndsAt: '2026-12-25T00:00:00.000Z' })).toBe('2026-12-25T00:00:00.000Z');
  });

  it('prefers a paid plan to the trial, so subscribing early shows the plan bought', () => {
    const signedUp = {
      createdAt: '2026-10-26T00:00:00.000Z',
      billing: { tier: 'driver_new' as const, status: 'active' as const },
    };
    expect(effectivePlan(signedUp, NOW)).toBe('driver_new');
  });
});

describe('checkAcceptAllowed', () => {
  it('lets the trial and shipper plans pick up as many as they like', () => {
    expect(checkAcceptAllowed('trial', 500).ok).toBe(true);
    expect(checkAcceptAllowed('growth', 500).ok).toBe(true);
  });

  it('gives Driver New 20 pick-ups a month, and points it at the plans above', () => {
    expect(checkAcceptAllowed('driver_new', 19).ok).toBe(true);
    const refused = checkAcceptAllowed('driver_new', 20);
    expect(!refused.ok && refused.message).toMatch(/all 20 loads in your Driver New plan this month.*Driver Fleet or Driver Pro/);
  });

  it('gives Driver Fleet 60 a month, and points it at Driver Pro', () => {
    expect(checkAcceptAllowed('driver_fleet', 59).ok).toBe(true);
    const refused = checkAcceptAllowed('driver_fleet', 60);
    expect(!refused.ok && refused.message).toMatch(/all 60 loads in your Driver Fleet plan.*Driver Pro.*unlimited/);
  });

  it('never meters Driver Pro', () => {
    expect(checkAcceptAllowed('driver_pro', 10_000).ok).toBe(true);
  });

  it('allows one pick-up a day without a plan, and says how to get more', () => {
    expect(checkAcceptAllowed('free', 0).ok).toBe(true);
    const refused = checkAcceptAllowed('free', 1);
    expect(!refused.ok && refused.message).toMatch(/1 load a day.*today's.*Driver plan/);
  });

  it('meters the driver plans by the month', () => {
    expect(PICKUP_ALLOWANCE.driver_new).toEqual({ count: 20, per: 'month' });
    expect(PICKUP_ALLOWANCE.driver_fleet).toEqual({ count: 60, per: 'month' });
    expect(PICKUP_ALLOWANCE.driver_pro).toBeNull();
  });
});

describe('checkLoadAllowance', () => {
  it('allows one post a day without a plan, and refuses the second, saying what to do', () => {
    expect(checkLoadAllowance('free', 0)).toEqual({ ok: true });
    const refused = checkLoadAllowance('free', 1);
    expect(!refused.ok && refused.message).toMatch(/1 load a day.*today's.*shipper plan/);
  });

  it('meters shipper plans by the month', () => {
    expect(checkLoadAllowance('starter', 24)).toEqual({ ok: true });
    const refused = checkLoadAllowance('starter', 25);
    expect(!refused.ok && refused.message).toMatch(/25 loads in your Starter plan this month/);
  });

  it('never meters the Fleet tier or the trial', () => {
    expect(checkLoadAllowance('fleet', 10_000)).toEqual({ ok: true });
    expect(checkLoadAllowance('trial', 10_000)).toEqual({ ok: true });
  });

  it('treats the Driver plans as free for posting — they buy picking up', () => {
    for (const tier of ['driver_new', 'driver_fleet', 'driver_pro'] as const) {
      expect(checkLoadAllowance(tier, 0).ok).toBe(true);
      expect(checkLoadAllowance(tier, 1).ok).toBe(false);
    }
  });
});

describe('ukDayStart — when a daily allowance resets', () => {
  it('is midnight UK time: UTC midnight in winter', () => {
    expect(ukDayStart('2026-12-10T15:00:00.000Z')).toBe('2026-12-10T00:00:00.000Z');
    expect(ukDayStart('2026-12-10T00:00:00.000Z')).toBe('2026-12-10T00:00:00.000Z');
  });

  it('is 23:00 UTC the evening before in summer', () => {
    expect(ukDayStart('2026-07-10T15:00:00.000Z')).toBe('2026-07-09T23:00:00.000Z');
    // 23:30 UTC on 10 July is already 11 July in the UK.
    expect(ukDayStart('2026-07-10T23:30:00.000Z')).toBe('2026-07-10T23:00:00.000Z');
  });

  it('copes with the days the clocks change', () => {
    // Clocks went forward at 01:00 UTC on 29 March 2026: that UK day began
    // at midnight GMT.
    expect(ukDayStart('2026-03-29T12:00:00.000Z')).toBe('2026-03-29T00:00:00.000Z');
    // They go back at 01:00 UTC on 25 October 2026: that day began at
    // midnight BST, i.e. 23:00 UTC on the 24th.
    expect(ukDayStart('2026-10-25T12:00:00.000Z')).toBe('2026-10-24T23:00:00.000Z');
  });
});

describe('the Stripe edges', () => {
  it('derives the tier from the price lookup key, and nothing else', () => {
    expect(tierFromLookupKey('mbh_growth_monthly')).toBe('growth');
    expect(tierFromLookupKey('mbh_driver_new_monthly')).toBe('driver_new');
    expect(tierFromLookupKey('mbh_driver_fleet_monthly')).toBe('driver_fleet');
    expect(tierFromLookupKey('mbh_driver_pro_monthly')).toBe('driver_pro');
    expect(tierFromLookupKey('growth')).toBeNull();
    expect(tierFromLookupKey(undefined)).toBeNull();
  });

  it('starts the month at midnight UTC on the 1st', () => {
    expect(monthStartUtc('2026-10-27T13:00:00.000Z')).toBe('2026-10-01T00:00:00.000Z');
    expect(monthStartUtc('2026-01-01T00:00:00.000Z')).toBe('2026-01-01T00:00:00.000Z');
  });

  it('accepts only real Stripe link shapes, so a typo cannot send shippers elsewhere', () => {
    expect(isStripePaymentLink('https://buy.stripe.com/test_abc123')).toBe(true);
    expect(isStripePaymentLink('https://buy.stripe.com.evil.test/abc')).toBe(false);
    expect(isStripePaymentLink('http://buy.stripe.com/abc')).toBe(false);
    expect(isStripePortalUrl('https://billing.stripe.com/p/login/test_xyz')).toBe(true);
    expect(isStripePortalUrl('https://billing.stripe.com/p/session/xyz')).toBe(false);
  });

  it('tells the payment link which company is paying', () => {
    expect(paymentLinkFor('https://buy.stripe.com/abc', 'tenant-1', 'a+b@acme.test')).toBe(
      'https://buy.stripe.com/abc?client_reference_id=tenant-1&prefilled_email=a%2Bb%40acme.test'
    );
    expect(paymentLinkFor('https://buy.stripe.com/abc', 'tenant-1', null)).toBe(
      'https://buy.stripe.com/abc?client_reference_id=tenant-1'
    );
  });
});

describe('a free plan with an end date', () => {
  const setAt = '2026-10-20T12:00:00.000Z';
  const given = (days: number | null) => ({
    ...old,
    billing: { override: { tier: 'driver_fleet' as const, note: '', setAt, expiresAt: freePlanExpiry(setAt, days) } },
  });

  it('lasts the days given, then the company falls back on its own', () => {
    expect(freePlanExpiry(setAt, 7)).toBe('2026-10-27T12:00:00.000Z');
    expect(effectivePlan(given(14), NOW)).toBe('driver_fleet');
    expect(effectivePlan(given(7), '2026-10-27T11:59:59.000Z')).toBe('driver_fleet');
    expect(effectivePlan(given(7), '2026-10-27T12:00:00.000Z')).toBe('free');
  });

  it('falls back to what the company pays for, not to nothing', () => {
    const lapsed = {
      ...given(7),
      billing: { ...given(7).billing, tier: 'driver_new' as const, status: 'active' as const },
    };
    expect(activeOverride(lapsed.billing, '2026-11-01T00:00:00.000Z')).toBeNull();
    expect(effectivePlan(lapsed, '2026-11-01T00:00:00.000Z')).toBe('driver_new');
  });

  it('has no end when given with none, as before', () => {
    expect(freePlanExpiry(setAt, null)).toBeNull();
    expect(effectivePlan(given(null), '2030-01-01T00:00:00.000Z')).toBe('driver_fleet');
  });
});

describe('the single Driver plan from before the split', () => {
  // Stored data is untyped at runtime: a plan given, or a price provisioned,
  // before the split still says 'driver'.
  const legacy = (billing: Record<string, unknown>) => ({ ...old, billing } as unknown as PlanSubject);

  it('is read as Driver New, whether paid for or given', () => {
    expect(effectivePlan(legacy({ tier: 'driver', status: 'active' }), NOW)).toBe('driver_new');
    expect(effectivePlan(legacy({ override: { tier: 'driver', note: '', setAt: NOW } }), NOW)).toBe('driver_new');
    expect(tierFromLookupKey('mbh_driver_monthly')).toBe('driver_new');
    expect(normalizeTier('driver')).toBe('driver_new');
  });

  it('entitles to nothing when the stored tier is not one we know', () => {
    expect(effectivePlan(legacy({ tier: 'platinum', status: 'active' }), NOW)).toBe('free');
  });
});
