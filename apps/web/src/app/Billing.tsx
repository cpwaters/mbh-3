import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, CreditCard, ExternalLink, Info } from 'lucide-react';
import {
  DRIVER_TIERS,
  MONTHLY_LOAD_ALLOWANCE,
  PLAN_LABELS,
  SHIPPER_TIERS,
  TRIAL_DAYS,
  activeOverride,
  effectivePlan,
  formatGbp,
  isShipperTier,
  monthStartUtc,
  paymentLinkFor,
  trialDaysLeft,
  trialEndsAt,
  type BillingConfig,
  type PlanSubject,
  type PlanTier,
} from '@mbh/domain';
import { useApp } from './context';
import { getReader } from '../lib/reader';

// A company's plan: its free trial, what it is on, how much of this month's
// posting allowance is used, and the way to change it. One page for both
// sides of the marketplace — a shipper sees the shipper plans, a driver sees
// the Driver plan, a company that does both sees both.
//
// Paying happens on Stripe's own pages (a payment link, the customer portal):
// this page never touches a card and never calls Stripe. The plan shown is
// what Stripe's webhook last told us.

const PLAN_BLURBS: Record<PlanTier, string> = {
  starter: 'For a shipper with the odd load to move.',
  growth: 'For a regular flow of backhauls every week.',
  fleet: 'Unlimited loads, for a shipper running at volume.',
  driver: 'For an owner-driver: accept as many backhauls as you can run.',
};

function whatItBuys(tier: PlanTier): string {
  if (!isShipperTier(tier)) return 'Accept loads';
  const allowance = MONTHLY_LOAD_ALLOWANCE[tier];
  return allowance === null ? 'Unlimited loads' : `${allowance} loads a month`;
}

function formatDay(iso: string | undefined | null): string {
  if (iso === undefined || iso === null) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; config: BillingConfig; plan: PlanSubject; posted: number };

export default function Billing() {
  const app = useApp();
  const [params] = useSearchParams();
  const tenantId = app.selected?.tenantId;
  const isOwner = app.selected?.role === 'owner';
  const ships = app.selected?.capabilities.includes('shipper') ?? false;
  const carries = app.selected?.capabilities.includes('carrier') ?? false;
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (tenantId === undefined) return;
    let cancelled = false;
    const reader = getReader();
    Promise.all([
      reader.billingConfig(),
      reader.tenantPlan(tenantId),
      reader.loadsPostedSince(tenantId, monthStartUtc(new Date().toISOString())),
    ])
      .then(([config, plan, posted]) => {
        if (!cancelled) setState({ kind: 'ready', config, plan: plan ?? {}, posted });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const now = new Date().toISOString();
  const email = app.auth.session?.email ?? null;
  const plan = state.kind === 'ready' ? state.plan : {};
  const billing = plan.billing;
  const tier = effectivePlan(plan, now);
  const gift = activeOverride(billing, now);
  const allowance = MONTHLY_LOAD_ALLOWANCE[tier];
  const tiers: PlanTier[] = [...(ships ? SHIPPER_TIERS : []), ...(carries ? DRIVER_TIERS : [])];

  const portalHref = useMemo(() => {
    if (state.kind !== 'ready' || state.config.portalUrl === '') return null;
    return email !== null ? `${state.config.portalUrl}?prefilled_email=${encodeURIComponent(email)}` : state.config.portalUrl;
  }, [state, email]);

  const subscribed =
    billing?.stripeSubscriptionId !== undefined && billing.status !== undefined && billing.status !== 'canceled';

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Billing</h1>
        <p className="text-gray-600">
          Every account starts with a {TRIAL_DAYS}-day free trial.{' '}
          {ships && carries
            ? 'After it, shipper plans set how many loads you can post, and any plan lets you accept loads.'
            : ships
              ? 'After it, your plan sets how many loads you can post each month.'
              : 'After it, the Driver plan keeps you accepting loads.'}
        </p>
      </div>

      {params.get('checkout') === 'done' && (
        <div role="status" className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800">
          Thanks — payment received by Stripe. Your new plan appears here as soon as Stripe confirms it, usually within a
          minute. Refresh if it has not yet.
        </div>
      )}

      {state.kind === 'loading' && <p className="text-gray-600">Loading your plan…</p>}
      {state.kind === 'error' && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          Could not read your plan. Try again.
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          <section className="bg-white rounded-2xl shadow-md border border-gray-100 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">Your plan</p>
                <p className="text-2xl font-bold text-gray-900">{PLAN_LABELS[tier]}</p>
                <p className="text-sm text-gray-600 mt-1">
                  {gift !== null ? (
                    <>
                      Provided by MyBackHaul
                      {gift.expiresAt != null ? ` until ${formatDay(gift.expiresAt)}` : ''}
                      {gift.note ? ` — ${gift.note}` : ''}.
                    </>
                  ) : tier === 'trial' ? (
                    <>
                      Ends on {formatDay(trialEndsAt(plan))} — {trialDaysLeft(plan, now)} day
                      {trialDaysLeft(plan, now) === 1 ? '' : 's'} left. Choose a plan any time before then to carry on
                      without a break.
                    </>
                  ) : billing?.status === 'past_due' ? (
                    <span className="text-amber-700">
                      Your last payment did not go through. Stripe is retrying — update your card to keep your plan.
                    </span>
                  ) : billing?.cancelAtPeriodEnd && billing.currentPeriodEnd ? (
                    <>Ends on {formatDay(billing.currentPeriodEnd)}.</>
                  ) : tier !== 'free' && billing?.currentPeriodEnd ? (
                    <>Renews on {formatDay(billing.currentPeriodEnd)}.</>
                  ) : carries && !ships ? (
                    <span className="text-amber-700">
                      Your free trial has ended. Choose the Driver plan to accept loads.
                    </span>
                  ) : (
                    <>Your free trial has ended — you are on the free allowance.</>
                  )}
                </p>
              </div>
              {ships && (
                <div className="text-right">
                  <p className="text-sm text-gray-500">Loads posted this month</p>
                  <p className="text-2xl font-bold text-gray-900 tabular-nums">
                    {state.posted}
                    {allowance !== null && <span className="text-gray-400 font-medium"> / {allowance}</span>}
                  </p>
                </div>
              )}
            </div>
            {ships && allowance !== null && (
              <div className="mt-4 h-2 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
                <div
                  className={`h-full ${state.posted >= allowance ? 'bg-red-500' : 'bg-blue-600'}`}
                  style={{ width: `${Math.min(100, (state.posted / allowance) * 100)}%` }}
                />
              </div>
            )}
            {!state.config.enforced && (
              <p className="mt-4 text-sm text-gray-600 inline-flex items-start gap-2">
                <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-600" />
                Plans are not being enforced yet, so nothing is limited for now.
              </p>
            )}
            {portalHref !== null && billing?.stripeCustomerId !== undefined && isOwner && (
              <a
                href={portalHref}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50"
              >
                <CreditCard className="w-4 h-4" />
                Manage subscription, card and invoices
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </section>

          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Plans</h2>
            <div className={`grid gap-4 ${tiers.length > 1 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
              {tiers.map((option) => {
                const link = state.config.paymentLinks[option];
                const price = state.config.monthlyPricePence[option];
                const current = tier === option;
                return (
                  <div
                    key={option}
                    className={`bg-white rounded-2xl shadow-md border p-5 flex flex-col ${current ? 'border-blue-500' : 'border-gray-100'}`}
                  >
                    <h3 className="text-lg font-bold text-gray-900">{PLAN_LABELS[option]}</h3>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {price !== undefined ? (
                        <>
                          {formatGbp(price)}
                          <span className="text-sm font-medium text-gray-500"> / month</span>
                        </>
                      ) : (
                        <span className="text-base text-gray-500">Price on request</span>
                      )}
                    </p>
                    <p className="text-sm font-medium text-gray-800 mt-2">{whatItBuys(option)}</p>
                    <p className="text-sm text-gray-600 mt-1 flex-1">{PLAN_BLURBS[option]}</p>
                    <div className="mt-4">
                      {current ? (
                        <span className="inline-flex items-center gap-1.5 text-blue-700 font-medium">
                          <Check className="w-4 h-4" /> Your plan
                        </span>
                      ) : link === undefined ? (
                        <span className="text-sm text-gray-500">Opening soon</span>
                      ) : !isOwner ? (
                        <span className="text-sm text-gray-500">Ask your company’s owner to change plan</span>
                      ) : subscribed && isShipperTier(option) && portalHref !== null ? (
                        // Already subscribed: changing between shipper plans
                        // happens in the portal, so the old subscription is
                        // replaced rather than a second one started beside it.
                        <a
                          href={portalHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700"
                        >
                          Switch to {PLAN_LABELS[option]}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <a
                          href={paymentLinkFor(link, tenantId ?? '', email)}
                          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700"
                        >
                          Choose {PLAN_LABELS[option]}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-gray-500 mt-3">
              {ships && `Without a shipper plan you can post ${MONTHLY_LOAD_ALLOWANCE.free} loads a month free. `}
              Payment is taken by Stripe; we never see your card.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
