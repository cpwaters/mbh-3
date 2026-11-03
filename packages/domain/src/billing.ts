// Subscriptions. Every company starts with a 30-day free trial. After it,
// without a plan, a company may post one load a day and pick up one load a
// day; shipper plans lift the posting limit and the Driver plan — a lower,
// individual price — lifts the pick-up limit (00-product-brief.md §1,
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

export const TRIAL_DAYS = 30;

// How many of something a company may do, per day or per calendar month.
// null = unlimited.
export interface Allowance {
  count: number;
  per: 'day' | 'month';
}

// Posting loads. Shipper plans buy a monthly allowance; with no plan (or
// only the Driver plan, which buys picking up, not posting) it is one a day.
export const POSTING_ALLOWANCE: Readonly<Record<EffectiveTier, Allowance | null>> = {
  free: { count: 1, per: 'day' },
  trial: null,
  starter: { count: 25, per: 'month' },
  growth: { count: 100, per: 'month' },
  fleet: null,
  driver: { count: 1, per: 'day' },
};

// Picking up (accepting) loads. Any plan is unlimited — the Driver plan is
// the cheap one made for it, and a shipper plan covers a company that also
// carries. With no plan it is one a day.
export const PICKUP_ALLOWANCE: Readonly<Record<EffectiveTier, Allowance | null>> = {
  free: { count: 1, per: 'day' },
  trial: null,
  starter: null,
  growth: null,
  fleet: null,
  driver: null,
};

export function describeAllowance(allowance: Allowance | null, noun: string): string {
  if (allowance === null) return `Unlimited ${noun}s`;
  const what = allowance.count === 1 ? noun : `${noun}s`;
  return `${allowance.count} ${what} a ${allowance.per}`;
}

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

// When a company's free trial ends: TRIAL_DAYS after it was created, or the
// end stamped on it at sign-up if that is later. Taking the later of the two
// means lengthening the trial reaches companies already in theirs — a sign-up
// stamped with the old 14 days gets the full 30. null when neither is known,
// which means no trial.
export function trialEndsAt(tenant: PlanSubject): string | null {
  const created = Date.parse(tenant.createdAt ?? '');
  const fromCreated = Number.isNaN(created) ? null : new Date(created + TRIAL_DAYS * 86_400_000).toISOString();
  const stamped = tenant.trialEndsAt ?? null;
  if (fromCreated === null) return stamped;
  if (stamped === null) return fromCreated;
  return stamped > fromCreated ? stamped : fromCreated;
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

// Minutes the UK clock is ahead of UTC at `instant` (0 in winter, 60 in
// summer), from the platform's own time-zone data — no library needed.
function ukOffsetMinutes(instant: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return Math.round((asUtc - Math.floor(instant / 60_000) * 60_000) / 60_000);
}

// The first instant of today in the UK — when a daily allowance resets. The
// people using this are in UK yards, so "a day" is midnight to midnight on
// their clock, not on UTC's.
export function ukDayStart(nowIso: string): string {
  const now = Date.parse(nowIso);
  const local = new Date(now + ukOffsetMinutes(now) * 60_000);
  const midnightAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // The offset at midnight itself, which differs from now's on the two days
  // a year the clocks change.
  return new Date(midnightAsUtc - ukOffsetMinutes(midnightAsUtc) * 60_000).toISOString();
}

// Where the current allowance period began, for counting against it.
export function allowancePeriodStart(allowance: Allowance, nowIso: string): string {
  return allowance.per === 'day' ? ukDayStart(nowIso) : monthStartUtc(nowIso);
}

export type AllowanceCheck = { ok: true } | { ok: false; message: string };

const PERIOD_WORDS: Record<Allowance['per'], string> = { day: 'today', month: 'this month' };

// Whether one more load may be posted, given how many have been posted in the
// current period. Said in the shipper's terms: how many, on which plan, and
// what to do about it.
export function checkLoadAllowance(tier: EffectiveTier, postedInPeriod: number): AllowanceCheck {
  const allowance = POSTING_ALLOWANCE[tier];
  if (allowance === null || postedInPeriod < allowance.count) return { ok: true };
  const when = PERIOD_WORDS[allowance.per];
  if (tier === 'free' || tier === 'driver') {
    return {
      ok: false,
      message: `Without a shipper plan you can post ${describeAllowance(allowance, 'load')}, and you have posted ${when}'s. Choose a shipper plan under Billing to post more.`,
    };
  }
  return {
    ok: false,
    message: `You've posted all ${allowance.count} loads in your ${PLAN_LABELS[tier]} plan ${when}. Upgrade under Billing to post more.`,
  };
}

// Whether one more load may be picked up, given how many the company has
// accepted in the current period.
export function checkAcceptAllowed(tier: EffectiveTier, acceptedInPeriod: number): AllowanceCheck {
  const allowance = PICKUP_ALLOWANCE[tier];
  if (allowance === null || acceptedInPeriod < allowance.count) return { ok: true };
  return {
    ok: false,
    message: `Without a plan you can pick up ${describeAllowance(allowance, 'load')}, and you have picked up ${PERIOD_WORDS[allowance.per]}'s. Choose the Driver plan under Billing to pick up more.`,
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
