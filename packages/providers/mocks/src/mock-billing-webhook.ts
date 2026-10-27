import type { BillingEvent } from '@mbh/domain';
import type { BillingWebhook, BillingWebhookOutcome } from '@mbh/provider-interfaces';

// A BillingWebhook for tests: the "signature" is a fixed string, and the body
// is already a domain BillingEvent (or { ignore: reason }). It exercises
// everything downstream of verification — the route's fail-closed handling,
// the system action, idempotency — without any provider wire format.
export const MOCK_WEBHOOK_SIGNATURE = 'mock-valid-signature';

export class MockBillingWebhook implements BillingWebhook {
  receive(rawBody: string, signatureHeader: string | undefined): BillingWebhookOutcome {
    if (signatureHeader !== MOCK_WEBHOOK_SIGNATURE) return { kind: 'rejected' };
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { kind: 'rejected' };
    }
    if (typeof body !== 'object' || body === null) return { kind: 'malformed', message: 'not an object' };
    if ('ignore' in body) return { kind: 'ignored', reason: String((body as { ignore: unknown }).ignore) };
    if (!('kind' in body)) return { kind: 'malformed', message: 'no kind' };
    return { kind: 'event', event: body as BillingEvent };
  }
}
