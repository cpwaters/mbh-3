import { describe, expect, it } from 'vitest';
import {
  checkLoadAllowance,
  effectiveTier,
  isStripePaymentLink,
  isStripePortalUrl,
  monthStartUtc,
  paymentLinkFor,
  tierFromLookupKey,
} from './billing.js';

describe('effectiveTier', () => {
  it('is free with no billing at all', () => {
    expect(effectiveTier(undefined)).toBe('free');
    expect(effectiveTier({})).toBe('free');
  });

  it('is the paid tier while Stripe says the subscription is good', () => {
    expect(effectiveTier({ tier: 'growth', status: 'active' })).toBe('growth');
    expect(effectiveTier({ tier: 'growth', status: 'trialing' })).toBe('growth');
  });

  it('keeps the plan while a renewal is being retried, and drops it once Stripe gives up', () => {
    expect(effectiveTier({ tier: 'starter', status: 'past_due' })).toBe('starter');
    expect(effectiveTier({ tier: 'starter', status: 'unpaid' })).toBe('free');
    expect(effectiveTier({ tier: 'starter', status: 'canceled' })).toBe('free');
    expect(effectiveTier({ tier: 'starter', status: 'incomplete' })).toBe('free');
  });

  it('lets the founder’s override outrank Stripe, either way', () => {
    const override = { tier: 'fleet' as const, note: 'Pilot customer', setAt: '2026-10-01T00:00:00.000Z' };
    expect(effectiveTier({ tier: 'starter', status: 'canceled', override })).toBe('fleet');
    expect(effectiveTier({ override })).toBe('fleet');
    expect(effectiveTier({ tier: 'growth', status: 'active', override: null })).toBe('growth');
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

  it('never meters the Fleet tier', () => {
    expect(checkLoadAllowance('fleet', 10_000)).toEqual({ ok: true });
  });
});

describe('the Stripe edges', () => {
  it('derives the tier from the price lookup key, and nothing else', () => {
    expect(tierFromLookupKey('mbh_growth_monthly')).toBe('growth');
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
