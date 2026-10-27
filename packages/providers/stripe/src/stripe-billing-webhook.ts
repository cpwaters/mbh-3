import type { BillingWebhook, BillingWebhookOutcome } from '@mbh/provider-interfaces';
import { parseStripeEvent } from '@mbh/wire';
import { verifyStripeSignature } from './webhook-signature.js';

// The BillingWebhook for Stripe: signature first, then the wire mapping.
export class StripeBillingWebhook implements BillingWebhook {
  constructor(private readonly signingSecret: string) {
    // No secret means no webhook, not an open one — the composition root
    // passes null instead of constructing this.
    if (signingSecret === '') throw new Error('StripeBillingWebhook needs a signing secret');
  }

  receive(rawBody: string, signatureHeader: string | undefined, nowSeconds: number): BillingWebhookOutcome {
    const verified = verifyStripeSignature(this.signingSecret, rawBody, signatureHeader, nowSeconds);
    if (!verified.ok) return { kind: 'rejected' };
    const outcome = parseStripeEvent(verified.body);
    if (!outcome.ok) return { kind: 'malformed', message: outcome.message };
    if ('ignored' in outcome) return { kind: 'ignored', reason: outcome.ignored };
    return { kind: 'event', event: outcome.event };
  }
}
