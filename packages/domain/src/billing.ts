// Subscriptions. Every company starts with a 14-day free trial; after it,
// shippers pay to post loads beyond a small free allowance, and drivers pay
// a lower, individual price to keep accepting loads (00-product-brief.md §1,
// ADR-0004). Tiers are derived from the Stripe Price — by the price's lookup
// key, which the provisioning script sets and which travels on every
// subscription event, so no price-id mapping is configured anywhere.
//
// A driver is a person, not a fleet: signing up as a carrier creates a
// one-person carrier company, so the Driver plan is held on that company
// like any other plan.

// The parts of a company the plan depends on. Loose on purpose: every field
// is optional, so a partial read (or a company that predates the field) is
// still a valid answer.
export interface PlanSubject {
  billing?: TenantBilling | undefined;
  createdAt?: string | undefined;
  trialEndsAt?: string | undefined;
}

export type ShipperTier = 'starter' | 'growth' | 'fleet';
export type DriverTier = 'driver';
export type PlanTier = ShipperTier | DriverTier;

// What a company is entitled to right now: a paid (or founder-given) tier,
// the free trial, or — after the trial, with no plan — free.
export type EffectiveTier = PlanTier | 'trial' | 'free';

export const SHIPPER_TIERS: readonly ShipperTier[] = ['starter', 'growth', 'fleet'];
export const DRIVER_TIERS: readonly DriverTier[] = ['driver'];
export const PLAN_TIERS: readonly PlanTier[] = [...SHIPPER_TIERS, ...DRIVER_TIERS];

export function isShipperTier(tier: PlanTier): tier is ShipperTier {
  return (SHIPPER_TIERS as readonly string[]).includes(tier);
}

export const PLAN_LABELS: Readonly<Record<EffectiveTier, string>> = {
  free: 'Free',
  trial: 'Free trial',
  starter: 'Starter',
  growth: 'Growth',
  fleet: 'Fleet',
  driver: 'Driver',
};

export const TRIAL_DAYS = 14;

// Loads a company may post per calendar month (UTC). null = unlimited. The
// Driver plan buys accepting loads, not posting them, so for posting it is
// the free allowance.
export const MONTHLY_LOAD_ALLOWANCE: Readonly<Record<EffectiveTier, number | null>> = {
  free: 3,
  trial: null,
  starter: 25,
  growth: 100,
  fleet: null,
  driver: 3,
};

export const PLAN_LOOKUP_KEYS: Readonly<Record<PlanTier, string>> = {
  starter: 'mbh_starter_monthly',
  growth: 'mbh_growth_monthly',
  fleet: 'mbh_fleet_monthly',
  driver: 'mbh_driver_monthly',
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
// customer, a partner). It outranks whatever Stripe says while it lasts.
export interface PlanOverride {
  tier: PlanTier;
  note: string;
  setAt: string;
  // When the free plan ends. Absent or null: until the founder removes it.
  expiresAt?: string | null;
}

// How long the founder can give a plan for, in days. null = no end date.
export const FREE_PLAN_DAYS: readonly (number | null)[] = [7, 14, 30, null];

export function freePlanExpiry(setAtIso: string, days: number | null): string | null {
  return days === null ? null : new Date(Date.parse(setAtIso) + days * 86_400_000).toISOString();
}

// The override in force now, or null if there is none or it has run out —
// at which point the company falls back to what it pays for (or its trial,
// or free) without anyone having to remove it.
export function activeOverride(billing: TenantBilling | undefined, nowIso: string): PlanOverride | null {
  const override = billing?.override ?? null;
  if (override === null) return null;
  if (override.expiresAt != null && nowIso >= override.expiresAt) return null;
  return override;
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

// When a company's free trial ends: set when it is created, or — for
// companies that predate trials — 14 days after it was. null when neither is
// known, which means no trial.
export function trialEndsAt(tenant: PlanSubject): string | null {
  if (tenant.trialEndsAt !== undefined) return tenant.trialEndsAt;
  const created = Date.parse(tenant.createdAt ?? '');
  if (Number.isNaN(created)) return null;
  return new Date(created + TRIAL_DAYS * 86_400_000).toISOString();
}

export function trialEndsAtFor(createdAtIso: string): string {
  return new Date(Date.parse(createdAtIso) + TRIAL_DAYS * 86_400_000).toISOString();
}

// What the company is entitled to now. In order: the founder's override, a
// subscription Stripe says is good, the free trial, then free.
export function effectivePlan(tenant: PlanSubject, nowIso: string): EffectiveTier {
  const billing = tenant.billing;
  const override = activeOverride(billing, nowIso);
  if (override !== null) return override.tier;
  if (billing?.tier !== undefined && billing.tier !== null && isEntitledStatus(billing.status)) return billing.tier;
  const trialEnd = trialEndsAt(tenant);
  if (trialEnd !== null && nowIso < trialEnd) return 'trial';
  return 'free';
}

// Whole days left in the trial, rounded up, for "3 days left".
export function trialDaysLeft(tenant: PlanSubject, nowIso: string): number {
  const end = trialEndsAt(tenant);
  if (end === null) return 0;
  return Math.max(0, Math.ceil((Date.parse(end) - Date.parse(nowIso)) / 86_400_000));
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
  if (tier === 'free' || tier === 'driver') {
    return {
      ok: false,
      message: `You've posted your ${allowance} free loads this month. Choose a shipper plan under Billing to post more.`,
    };
  }
  return {
    ok: false,
    message: `You've posted all ${allowance} loads in your ${PLAN_LABELS[tier]} plan this month. Upgrade under Billing to post more.`,
  };
}

// Whether the company may accept a load. Any plan does — the Driver plan is
// the cheap one made for it, and a shipper plan covers a company that also
// carries. Only free, after the trial, does not.
export function checkAcceptAllowed(tier: EffectiveTier): AllowanceCheck {
  if (tier !== 'free') return { ok: true };
  return {
    ok: false,
    message: `Your ${TRIAL_DAYS}-day free trial has ended. Choose the Driver plan under Billing to accept loads.`,
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
  // what the Price says, this just saves a click to find out.
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
