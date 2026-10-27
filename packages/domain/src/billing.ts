// Subscriptions. Shippers pay; drivers ride free (00-product-brief.md §1).
// Three tiers, derived from the Stripe Price — by the price's lookup key,
// which the provisioning script sets and which travels on every
// subscription event, so no price-id mapping has to be configured anywhere.
//
// What a tier buys is a monthly allowance of posted loads. Carrier work is
// never metered: accepting, collecting and delivering are free at every tier.

export type PlanTier = 'starter' | 'growth' | 'fleet';

// A shipper with no paid plan (or one that has lapsed) is on the free
// allowance — enough to try the marketplace, not to run a business on.
export type EffectiveTier = PlanTier | 'free';

export const PLAN_TIERS: readonly PlanTier[] = ['starter', 'growth', 'fleet'];

export const PLAN_LABELS: Readonly<Record<EffectiveTier, string>> = {
  free: 'Free',
  starter: 'Starter',
  growth: 'Growth',
  fleet: 'Fleet',
};

// Loads a shipper may post per calendar month (UTC). null = unlimited.
export const MONTHLY_LOAD_ALLOWANCE: Readonly<Record<EffectiveTier, number | null>> = {
  free: 3,
  starter: 25,
  growth: 100,
  fleet: null,
};

export const PLAN_LOOKUP_KEYS: Readonly<Record<PlanTier, string>> = {
  starter: 'mbh_starter_monthly',
  growth: 'mbh_growth_monthly',
  fleet: 'mbh_fleet_monthly',
};

export function tierFromLookupKey(lookupKey: string | null | undefined): PlanTier | null {
  const match = PLAN_TIERS.find((tier) => PLAN_LOOKUP_KEYS[tier] === lookupKey);
  return match ?? null;
}

// Stripe's subscription statuses, verbatim.
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

export const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete',
  'incomplete_expired',
  'paused',
];

// past_due keeps the plan: Stripe is still retrying the card, and cutting a
// shipper off mid-dunning over a declined renewal punishes the wrong thing.
// When the retries run out Stripe moves it to unpaid or canceled, and that
// ends it.
export function isEntitledStatus(status: SubscriptionStatus | undefined): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

// The founder's hand on the scale: a plan given rather than bought (a pilot
// customer, a partner). It outranks whatever Stripe says.
export interface PlanOverride {
  tier: PlanTier;
  note: string;
  setAt: string;
}

// Held on the tenant doc as `billing`, so members read their own plan with
// the tenant read they already make. Written only by the system (from Stripe
// webhooks) and the founder (override) — never by a member.
export interface TenantBilling {
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  tier?: PlanTier | null;
  status?: SubscriptionStatus;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd?: boolean;
  updatedAt?: string;
  override?: PlanOverride | null;
}

export function effectiveTier(billing: TenantBilling | undefined): EffectiveTier {
  if (billing === undefined) return 'free';
  if (billing.override !== undefined && billing.override !== null) return billing.override.tier;
  if (billing.tier !== undefined && billing.tier !== null && isEntitledStatus(billing.status)) return billing.tier;
  return 'free';
}

// The first instant of the calendar month `now` falls in, UTC.
export function monthStartUtc(nowIso: string): string {
  const now = new Date(nowIso);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export type AllowanceCheck = { ok: true } | { ok: false; message: string };

// Whether one more load fits this month. Said in the shipper's terms: how
// many, on which plan, and what to do about it.
export function checkLoadAllowance(tier: EffectiveTier, postedThisMonth: number): AllowanceCheck {
  const allowance = MONTHLY_LOAD_ALLOWANCE[tier];
  if (allowance === null || postedThisMonth < allowance) return { ok: true };
  const plan = PLAN_LABELS[tier];
  return {
    ok: false,
    message:
      tier === 'free'
        ? `You've posted your ${allowance} free loads this month. Choose a plan under Billing to post more.`
        : `You've posted all ${allowance} loads in your ${plan} plan this month. Upgrade under Billing to post more.`,
  };
}

// Platform-wide billing settings, set by the founder from the back office.
// Nothing here is secret: payment links and the portal login page are public
// Stripe URLs. The webhook signing secret is NOT here — it never leaves the
// server's environment.
export interface BillingConfig {
  // Until the founder switches this on, allowances are shown but not
  // enforced — so shipping the code cannot lock out a shipper before Stripe
  // is set up and the links below exist.
  enforced: boolean;
  paymentLinks: Partial<Record<PlanTier, string>>;
  portalUrl: string;
  // Monthly price in pence for each tier, for display only — Stripe charges
  // what the Price says, this just saves a shipper a click to find out.
  monthlyPricePence: Partial<Record<PlanTier, number>>;
  updatedAt?: string;
}

export const DEFAULT_BILLING_CONFIG: BillingConfig = {
  enforced: false,
  paymentLinks: {},
  portalUrl: '',
  monthlyPricePence: {},
};

export function isStripePaymentLink(url: string): boolean {
  return /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_-]+$/.test(url);
}

export function isStripePortalUrl(url: string): boolean {
  return /^https:\/\/billing\.stripe\.com\/p\/login\/[A-Za-z0-9_-]+$/.test(url);
}

// A payment link only knows which company is paying if we tell it: Stripe
// carries client_reference_id through to checkout.session.completed, which is
// how the webhook ties the new subscription to this tenant.
export function paymentLinkFor(link: string, tenantId: string, email: string | null): string {
  const params = [`client_reference_id=${encodeURIComponent(tenantId)}`];
  if (email !== null && email !== '') params.push(`prefilled_email=${encodeURIComponent(email)}`);
  return `${link}?${params.join('&')}`;
}

// What a Stripe webhook means to us, once verified and parsed (the mapping
// lives in @mbh/wire). The payload of the system-only recordBillingEvent
// action. `createdAt` is Stripe's event time, used to drop a stale update
// that arrives after a newer one.
export type BillingEvent =
  | {
      kind: 'checkoutCompleted';
      eventId: string;
      createdAt: string;
      customerId: string;
      subscriptionId: string;
      tenantId: string;
    }
  | {
      kind: 'subscriptionChanged';
      eventId: string;
      createdAt: string;
      customerId: string;
      subscriptionId: string;
      status: SubscriptionStatus;
      // null when the price carries no lookup key we know — recorded, but
      // entitles to nothing.
      tier: PlanTier | null;
      currentPeriodEnd: string | null;
      cancelAtPeriodEnd: boolean;
    };
