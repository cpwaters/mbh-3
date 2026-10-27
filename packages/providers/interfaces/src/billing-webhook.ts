import type { BillingEvent } from '@mbh/domain';

// Receiving a payment provider's webhook: prove it came from them, then say
// what it means in domain terms. The implementation is the ONLY thing that
// knows the signing secret or the provider's wire format; when there is no
// secret there is no implementation, and the webhook route refuses
// everything (fail closed — architecture.md, Payments).
export type BillingWebhookOutcome =
  // Missing, forged or stale signature. Nothing in the body is believed.
  | { kind: 'rejected' }
  // Genuine, but not a shape we understand. A retry cannot fix it.
  | { kind: 'malformed'; message: string }
  // Genuine and understood, but nothing we act on.
  | { kind: 'ignored'; reason: string }
  | { kind: 'event'; event: BillingEvent };

export interface BillingWebhook {
  // Never throws: a bad webhook is an expected input, not an exceptional one.
  receive(rawBody: string, signatureHeader: string | undefined, nowSeconds: number): BillingWebhookOutcome;
}
