import { describe, expect, it } from 'vitest';
import { signStripePayload, verifyStripeSignature } from './webhook-signature.js';
import { StripeBillingWebhook } from './stripe-billing-webhook.js';

// A throwaway secret for the test only — the real one lives in the function's
// environment and nowhere else.
const SECRET = 'whsec_test_only_not_a_real_secret';
const NOW = 1_793_000_000;
const body = JSON.stringify({ id: 'evt_1', type: 'invoice.paid', created: NOW, data: { object: {} } });
const header = (t: number, sig: string) => `t=${t},v1=${sig}`;
const verify = (raw: string, sig: string | undefined, now = NOW) => verifyStripeSignature(SECRET, raw, sig, now);

describe('verifyStripeSignature', () => {
  it('accepts a genuine, fresh signature and hands back the parsed body', () => {
    expect(verify(body, header(NOW, signStripePayload(SECRET, NOW, body)), NOW + 10)).toEqual({
      ok: true,
      body: JSON.parse(body),
    });
  });

  it('accepts any one of several v1 signatures, as during a secret roll', () => {
    const good = signStripePayload(SECRET, NOW, body);
    const other = signStripePayload('whsec_old', NOW, body);
    expect(verify(body, `t=${NOW},v1=${other},v1=${good}`).ok).toBe(true);
  });

  it('refuses a missing or malformed header', () => {
    expect(verify(body, undefined).ok).toBe(false);
    expect(verify(body, 'nonsense').ok).toBe(false);
    expect(verify(body, `t=${NOW}`).ok).toBe(false);
  });

  it('refuses a body that was altered after signing', () => {
    const sig = signStripePayload(SECRET, NOW, body);
    expect(verify(body.replace('invoice.paid', 'customer.subscription.updated'), header(NOW, sig)).ok).toBe(false);
  });

  it('refuses a signature made with another secret', () => {
    expect(verify(body, header(NOW, signStripePayload('whsec_attacker', NOW, body))).ok).toBe(false);
  });

  it('refuses a replay outside the tolerance window, either side', () => {
    const sig = signStripePayload(SECRET, NOW, body);
    expect(verify(body, header(NOW, sig), NOW + 301).ok).toBe(false);
    expect(verify(body, header(NOW, sig), NOW - 301).ok).toBe(false);
  });

  it('refuses a correctly signed body that is not JSON', () => {
    const raw = 'not json';
    expect(verify(raw, header(NOW, signStripePayload(SECRET, NOW, raw))).ok).toBe(false);
  });
});

describe('StripeBillingWebhook', () => {
  const webhook = new StripeBillingWebhook(SECRET);
  const signed = (raw: string) => header(NOW, signStripePayload(SECRET, NOW, raw));

  it('will not be built without a secret — no secret means no webhook, not an open door', () => {
    expect(() => new StripeBillingWebhook('')).toThrow();
  });

  it('rejects before reading anything when the signature is wrong', () => {
    expect(webhook.receive(body, 't=1,v1=' + '0'.repeat(64), NOW)).toEqual({ kind: 'rejected' });
  });

  it('turns a genuine subscription event into a domain event', () => {
    const raw = JSON.stringify({
      id: 'evt_9',
      type: 'checkout.session.completed',
      created: NOW,
      data: { object: { mode: 'subscription', client_reference_id: 'tenant-1', customer: 'cus_1', subscription: 'sub_1' } },
    });
    expect(webhook.receive(raw, signed(raw), NOW)).toMatchObject({
      kind: 'event',
      event: { kind: 'checkoutCompleted', tenantId: 'tenant-1', customerId: 'cus_1' },
    });
  });

  it('acknowledges a genuine event it does not act on', () => {
    expect(webhook.receive(body, signed(body), NOW)).toEqual({ kind: 'ignored', reason: 'invoice.paid' });
  });

  it('calls a genuine but unrecognisable body malformed', () => {
    const raw = JSON.stringify({ not: 'an event' });
    expect(webhook.receive(raw, signed(raw), NOW).kind).toBe('malformed');
  });
});
