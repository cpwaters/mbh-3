import { describe, expect, it } from 'vitest';
import {
  checkAcceptAllowed,
  checkLoadAllowance,
  effectivePlan,
  trialDaysLeft,
  trialEndsAt,
  isStripePaymentLink,
  isStripePortalUrl,
  monthStartUtc,
  paymentLinkFor,
  tierFromLookupKey,
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
    expect(plan({ tier: 'driver', status: 'trialing' })).toBe('driver');
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

  it('is the trial for 14 days from sign-up, and free after', () => {
    const signedUp = { createdAt: '2026-10-20T12:00:00.000Z', trialEndsAt: '2026-11-03T12:00:00.000Z' };
    expect(effectivePlan(signedUp, NOW)).toBe('trial');
    expect(trialDaysLeft(signedUp, NOW)).toBe(7);
    expect(effectivePlan(signedUp, '2026-11-03T12:00:00.000Z')).toBe('free');
    expect(trialDaysLeft(signedUp, '2026-11-04T00:00:00.000Z')).toBe(0);
  });

  it('gives a company from before trials existed 14 days from when it was created', () => {
    expect(trialEndsAt({ createdAt: '2026-10-01T00:00:00.000Z' })).toBe('2026-10-15T00:00:00.000Z');
    expect(trialEndsAt({})).toBeNull();
  });

  it('prefers a paid plan to the trial, so subscribing early shows the plan bought', () => {
    const signedUp = { createdAt: '2026-10-26T00:00:00.000Z', billing: { tier: 'driver' as const, status: 'active' as const } };
    expect(effectivePlan(signedUp, NOW)).toBe('driver');
  });
});

describe('checkAcceptAllowed', () => {
  it('lets anyone in a trial or on any plan accept, and stops free after the trial', () => {
    expect(checkAcceptAllowed('trial').ok).toBe(true);
    expect(checkAcceptAllowed('driver').ok).toBe(true);
    expect(checkAcceptAllowed('growth').ok).toBe(true);
    const refused = checkAcceptAllowed('free');
    expect(!refused.ok && refused.message).toMatch(/14-day free trial has ended.*Driver plan/);
  });
});

describe('checkLoadAllowance', () => {
  it('allows up to the allowance and refuses the one after, saying what to do', () => {
    expect(checkLoadAllowance('free', 2)).toEqual({ ok: true });
    const refused = checkLoadAllowance('free', 3);
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.message).toMatch(/3 free loads.*Billing/);

    expect(checkLoadAllowance('starter', 24)).toEqual({ ok: true });
    expect(!checkLoadAllowance('starter', 25).ok && (checkLoadAllowance('starter', 25) as { message: string }).message).toMatch(
      /25 loads in your Starter plan/
    );
  });

  it('never meters the Fleet tier or the trial', () => {
    expect(checkLoadAllowance('fleet', 10_000)).toEqual({ ok: true });
    expect(checkLoadAllowance('trial', 10_000)).toEqual({ ok: true });
  });

  it('treats the Driver plan as free for posting — it buys accepting loads', () => {
    const refused = checkLoadAllowance('driver', 3);
    expect(!refused.ok && refused.message).toMatch(/shipper plan/);
  });
});

describe('the Stripe edges', () => {
  it('derives the tier from the price lookup key, and nothing else', () => {
    expect(tierFromLookupKey('mbh_growth_monthly')).toBe('growth');
    expect(tierFromLookupKey('mbh_driver_monthly')).toBe('driver');
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
