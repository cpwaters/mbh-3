import { z } from 'zod';
import { SUBSCRIPTION_STATUSES, tierFromLookupKey, type BillingEvent, type SubscriptionStatus } from '@mbh/domain';

// The wire shape of the Stripe webhook events we act on, and the ONE mapper to
// a domain BillingEvent. Only fields we use are declared; Stripe adds fields
// freely, and zod's default strip mode ignores them.
//
// Events handled:
//   checkout.session.completed            — ties a customer to a company
//   customer.subscription.created|updated|deleted — the plan itself
// Anything else is acknowledged and ignored (Stripe expects a 2xx).

const id = z.string().min(1);
const unixSeconds = z.number().int().nonnegative();
const toIso = (seconds: number): string => new Date(seconds * 1000).toISOString();

// Stripe expands a customer/subscription reference to an object only when
// asked; on webhooks it is the id string.
const ref = z.union([id, z.object({ id })]).transform((v) => (typeof v === 'string' ? v : v.id));

const envelope = z.object({
  id,
  type: z.string(),
  created: unixSeconds,
  data: z.object({ object: z.unknown() }),
});

const checkoutSession = z.object({
  mode: z.string(),
  client_reference_id: z.string().nullable().optional(),
  customer: ref.nullable(),
  subscription: ref.nullable(),
});

const subscription = z.object({
  id,
  customer: ref,
  status: z.string(),
  cancel_at_period_end: z.boolean().optional().default(false),
  // Moved onto the item in newer API versions; accept either.
  current_period_end: unixSeconds.nullable().optional(),
  items: z.object({
    data: z.array(
      z.object({
        current_period_end: unixSeconds.nullable().optional(),
        price: z.object({ id, lookup_key: z.string().nullable().optional() }),
      })
    ),
  }),
});

export type StripeEventOutcome =
  | { ok: true; event: BillingEvent }
  | { ok: true; ignored: string } // well-formed, but nothing we act on
  | { ok: false; message: string };

function issue(error: z.ZodError, what: string): { ok: false; message: string } {
  const first = error.issues[0];
  return { ok: false, message: `Unexpected ${what} shape: ${first?.path.join('.') ?? ''} ${first?.message ?? 'invalid'}`.trim() };
}

const SUBSCRIPTION_EVENTS = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
]);

export function parseStripeEvent(json: unknown): StripeEventOutcome {
  const env = envelope.safeParse(json);
  if (!env.success) return issue(env.error, 'Stripe event');
  const { id: eventId, type, created } = env.data;
  const createdAt = toIso(created);

  if (type === 'checkout.session.completed') {
    const session = checkoutSession.safeParse(env.data.data.object);
    if (!session.success) return issue(session.error, 'checkout session');
    const s = session.data;
    // A one-off payment, or a session with no company attached (someone used
    // the bare link without client_reference_id): nothing to tie, so say so
    // in the ignore reason rather than failing — a retry cannot fix it.
    if (s.mode !== 'subscription') return { ok: true, ignored: `checkout mode ${s.mode}` };
    if (s.client_reference_id == null || s.client_reference_id === '') {
      return { ok: true, ignored: 'checkout without a company reference' };
    }
    if (s.customer === null || s.subscription === null) return { ok: true, ignored: 'checkout without a subscription' };
    return {
      ok: true,
      event: {
        kind: 'checkoutCompleted',
        eventId,
        createdAt,
        customerId: s.customer,
        subscriptionId: s.subscription,
        tenantId: s.client_reference_id,
      },
    };
  }

  if (SUBSCRIPTION_EVENTS.has(type)) {
    const sub = subscription.safeParse(env.data.data.object);
    if (!sub.success) return issue(sub.error, 'subscription');
    const s = sub.data;
    const item = s.items.data[0];
    const status = (SUBSCRIPTION_STATUSES as readonly string[]).includes(s.status)
      ? (s.status as SubscriptionStatus)
      : // A status Stripe adds later is treated as not paying until we
        // decide otherwise — failing closed on money.
        'incomplete';
    const periodEnd = item?.current_period_end ?? s.current_period_end ?? null;
    return {
      ok: true,
      event: {
        kind: 'subscriptionChanged',
        eventId,
        createdAt,
        customerId: s.customer,
        subscriptionId: s.id,
        // A deleted subscription is over whatever its last status said.
        status: type === 'customer.subscription.deleted' ? 'canceled' : status,
        tier: tierFromLookupKey(item?.price.lookup_key),
        currentPeriodEnd: periodEnd === null ? null : toIso(periodEnd),
        cancelAtPeriodEnd: s.cancel_at_period_end,
      },
    };
  }

  return { ok: true, ignored: type };
}
