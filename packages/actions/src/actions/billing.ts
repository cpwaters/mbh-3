import { z } from 'zod';
import {
  AppError,
  PLAN_TIERS,
  SUBSCRIPTION_STATUSES,
  isStripePaymentLink,
  isStripePortalUrl,
  isShipperTier,
  freePlanExpiry,
  type BillingEvent,
  type PlanTier,
  type SubscriptionStatus,
  type Tenant,
  type TenantBilling,
} from '@mbh/domain';
import { billingConfigDoc, billingCustomerDoc, tenantDoc } from '@mbh/paths';
import type { DocData, TransactionContext } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireFounder } from '../require-founder.js';
import { requireSystem } from '../require-system.js';
import { zodParse } from '../parse.js';

// Subscriptions: the record of what each company pays for.
//
// Stripe is the source of truth for money; this is our record of what it told
// us. It arrives ONLY as a verified webhook, recorded through the Action
// Layer as a system action — never written by the webhook route directly,
// never by a member, and never from a synchronous call to Stripe in a user's
// request (non-negotiables 2 and 6).

const tier = z.enum(PLAN_TIERS as [PlanTier, ...PlanTier[]]);
const status = z.enum(SUBSCRIPTION_STATUSES as [SubscriptionStatus, ...SubscriptionStatus[]]);

const billingEventSchema: z.ZodType<BillingEvent> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('checkoutCompleted'),
    eventId: z.string().min(1),
    createdAt: z.string().min(1),
    customerId: z.string().min(1),
    subscriptionId: z.string().min(1),
    tenantId: z.string().min(1),
  }),
  z.object({
    kind: z.literal('subscriptionChanged'),
    eventId: z.string().min(1),
    createdAt: z.string().min(1),
    customerId: z.string().min(1),
    subscriptionId: z.string().min(1),
    status,
    tier: tier.nullable(),
    currentPeriodEnd: z.string().nullable(),
    cancelAtPeriodEnd: z.boolean(),
  }),
]);

// What we have accumulated about one Stripe customer. Stripe does not promise
// checkout.session.completed (which names the company) arrives before the
// subscription events (which name the plan), so both land here first and
// the company's plan is projected from this whenever both halves are known.
interface BillingCustomer {
  customerId: string;
  tenantId?: string;
  subscriptionId?: string;
  tier?: PlanTier | null;
  status?: SubscriptionStatus;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
  // Stripe's time on the newest subscription event applied, so an older one
  // delivered late cannot roll the plan back.
  subscriptionEventAt?: string;
}

function projectBilling(customer: BillingCustomer, existing: TenantBilling | undefined, now: string): TenantBilling {
  return {
    stripeCustomerId: customer.customerId,
    ...(customer.subscriptionId !== undefined ? { stripeSubscriptionId: customer.subscriptionId } : {}),
    tier: customer.tier ?? null,
    ...(customer.status !== undefined ? { status: customer.status } : {}),
    ...(customer.currentPeriodEnd != null ? { currentPeriodEnd: customer.currentPeriodEnd } : {}),
    cancelAtPeriodEnd: customer.cancelAtPeriodEnd ?? false,
    updatedAt: now,
    // The founder's override is theirs; a webhook never clears it.
    override: existing?.override ?? null,
  };
}

export interface RecordBillingEventResult extends DocData {
  applied: boolean;
  tenantId: string | null;
}

export const recordBillingEventHandler: ActionHandler<BillingEvent, RecordBillingEventResult> = {
  type: 'recordBillingEvent',
  // Keyed on Stripe's event id, so Stripe's redelivery of the same event is
  // answered from the idempotency marker instead of being applied twice.
  idempotent: true,
  parse: zodParse(billingEventSchema),
  async execute(tx, ctx, event) {
    requireSystem(ctx);

    const customerPath = billingCustomerDoc(event.customerId);
    const existing = ((await tx.get(customerPath)) as unknown as BillingCustomer | null) ?? {
      customerId: event.customerId,
    };
    let next: BillingCustomer = { ...existing };
    let applied = true;

    if (event.kind === 'checkoutCompleted') {
      next = { ...next, tenantId: event.tenantId, subscriptionId: event.subscriptionId };
    } else if (existing.subscriptionEventAt !== undefined && event.createdAt < existing.subscriptionEventAt) {
      applied = false; // stale: a newer state is already recorded
    } else {
      next = {
        ...next,
        subscriptionId: event.subscriptionId,
        tier: event.tier,
        status: event.status,
        currentPeriodEnd: event.currentPeriodEnd,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd,
        subscriptionEventAt: event.createdAt,
      };
    }

    // Reads before writes: the company, if this customer is tied to one yet.
    const tenantId = next.tenantId ?? null;
    const tenant = tenantId === null ? null : ((await tx.get(tenantDoc(tenantId))) as unknown as Tenant | null);
    if (tenantId !== null && tenant === null) {
      // client_reference_id named a company that does not exist. Record the
      // customer (so the money is traceable) but tie it to nothing.
      next = Object.fromEntries(Object.entries(next).filter(([key]) => key !== 'tenantId')) as unknown as BillingCustomer;
    }

    if (applied) {
      tx.write({ kind: 'set', path: customerPath, data: { ...next } as DocData });
      if (tenant !== null && tenantId !== null) {
        tx.write({
          kind: 'update',
          path: tenantDoc(tenantId),
          data: { billing: { ...projectBilling(next, tenant.billing, ctx.now) } as DocData },
        });
      }
    }

    return {
      result: { applied, tenantId: tenant !== null ? tenantId : null },
      auditDetail: {
        stripeEventId: event.eventId,
        kind: event.kind,
        customerId: event.customerId,
        applied,
        ...(tenant !== null && tenantId !== null ? { tenantId, companyName: tenant.name } : {}),
        ...(event.kind === 'subscriptionChanged' ? { tier: event.tier, status: event.status } : {}),
      },
    };
  },
};

const httpsUrlOrEmpty = (check: (url: string) => boolean, message: string) =>
  z
    .string()
    .trim()
    .refine((url) => url === '' || check(url), message);

const setBillingConfigSchema = z.object({
  enforced: z.boolean(),
  paymentLinks: z.object({
    starter: httpsUrlOrEmpty(isStripePaymentLink, 'That is not a Stripe payment link (https://buy.stripe.com/…).'),
    growth: httpsUrlOrEmpty(isStripePaymentLink, 'That is not a Stripe payment link (https://buy.stripe.com/…).'),
    fleet: httpsUrlOrEmpty(isStripePaymentLink, 'That is not a Stripe payment link (https://buy.stripe.com/…).'),
    // Optional so a client saved before the Driver plan existed still parses.
    driver: httpsUrlOrEmpty(isStripePaymentLink, 'That is not a Stripe payment link (https://buy.stripe.com/…).').optional(),
  }),
  portalUrl: httpsUrlOrEmpty(
    isStripePortalUrl,
    'That is not a Stripe customer portal link (https://billing.stripe.com/p/login/…).'
  ),
  monthlyPricePence: z.object({
    starter: z.number().int().positive().max(1_000_000).optional(),
    growth: z.number().int().positive().max(1_000_000).optional(),
    fleet: z.number().int().positive().max(1_000_000).optional(),
    driver: z.number().int().positive().max(1_000_000).optional(),
  }),
});

export type SetBillingConfigPayload = z.infer<typeof setBillingConfigSchema>;

export interface SetBillingConfigResult extends DocData {
  enforced: boolean;
}

// The founder's billing switchboard: the public Stripe links shippers are
// sent to, the prices shown beside them, and whether allowances bite yet.
export const setBillingConfigHandler: ActionHandler<SetBillingConfigPayload, SetBillingConfigResult> = {
  type: 'setBillingConfig',
  idempotent: true,
  parse: zodParse(setBillingConfigSchema),
  async execute(tx, ctx, payload) {
    requireFounder(ctx);
    // Switching enforcement on with nowhere to pay would lock shippers out
    // with no way back in.
    const links = Object.values(payload.paymentLinks).filter((l) => l !== undefined && l !== '');
    if (payload.enforced && links.length === 0) {
      throw new AppError(
        'invalid-payload',
        'Add at least one payment link before enforcing plans — otherwise a shipper at their limit has nowhere to pay.',
        { field: 'enforced' }
      );
    }
    const paymentLinks = Object.fromEntries(
      Object.entries(payload.paymentLinks).filter(([, l]) => l !== undefined && l !== '')
    );
    const monthlyPricePence = Object.fromEntries(
      Object.entries(payload.monthlyPricePence).filter(([, p]) => p !== undefined)
    );
    tx.write({
      kind: 'set',
      path: billingConfigDoc(),
      data: {
        enforced: payload.enforced,
        paymentLinks,
        portalUrl: payload.portalUrl,
        monthlyPricePence,
        updatedAt: ctx.now,
      },
    });
    return {
      result: { enforced: payload.enforced },
      auditDetail: { enforced: payload.enforced, tiersWithLinks: Object.keys(paymentLinks), portalUrl: payload.portalUrl },
    };
  },
};

const setCompanyPlanSchema = z.object({
  tenantId: z.string().min(1),
  // null removes the override, returning the company to whatever Stripe says.
  tier: tier.nullable(),
  note: z.string().trim().max(200).optional(),
  // How long the free plan lasts: 7, 14 or 30 days, or null for no end date.
  // Absent means no end date, as plans given before durations existed.
  days: z.union([z.literal(7), z.literal(14), z.literal(30)]).nullable().optional(),
});

export type SetCompanyPlanPayload = z.infer<typeof setCompanyPlanSchema>;

export interface SetCompanyPlanResult extends DocData {
  tenantId: string;
  tier: PlanTier | null;
}

async function readTenant(tx: TransactionContext, tenantId: string): Promise<Tenant> {
  const data = await tx.get(tenantDoc(tenantId));
  if (data === null) throw new AppError('not-found', 'That company no longer exists.');
  return data as unknown as Tenant;
}

// Give a company a plan without it paying (a pilot, a partner), or take that
// back. Recorded beside the Stripe state rather than over it, so removing the
// override returns the company to exactly what it pays for.
export const setCompanyPlanHandler: ActionHandler<SetCompanyPlanPayload, SetCompanyPlanResult> = {
  type: 'setCompanyPlan',
  idempotent: true,
  parse: zodParse(setCompanyPlanSchema),
  async execute(tx, ctx, payload) {
    requireFounder(ctx);
    const tenant = await readTenant(tx, payload.tenantId);
    // A plan has to be one the company can use: shipper plans for a company
    // that posts, the Driver plan for one that carries.
    if (payload.tier !== null) {
      const fits = isShipperTier(payload.tier)
        ? tenant.capabilities.includes('shipper')
        : tenant.capabilities.includes('carrier');
      if (!fits) {
        throw new AppError(
          'conflict',
          isShipperTier(payload.tier)
            ? 'That company does not post loads, so a shipper plan would do nothing for it.'
            : 'That company does not carry loads, so the Driver plan would do nothing for it.',
          { recoverable: false }
        );
      }
    }
    const note = payload.note ?? '';
    const expiresAt = freePlanExpiry(ctx.now, payload.days ?? null);
    const override =
      payload.tier === null ? null : { tier: payload.tier, note, setAt: ctx.now, expiresAt };
    tx.write({
      kind: 'update',
      path: tenantDoc(payload.tenantId),
      data: { billing: { ...(tenant.billing ?? {}), override, updatedAt: ctx.now } as DocData },
    });
    return {
      result: { tenantId: payload.tenantId, tier: payload.tier },
      auditDetail: {
        tenantId: payload.tenantId,
        companyName: tenant.name,
        from: tenant.billing?.override?.tier ?? 'none',
        to: payload.tier ?? 'none',
        ...(note !== '' ? { note } : {}),
        ...(payload.tier !== null ? { until: expiresAt ?? 'no end date' } : {}),
      },
    };
  },
};
