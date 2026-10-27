import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, CreditCard, ExternalLink, Info } from 'lucide-react';
import {
  MONTHLY_LOAD_ALLOWANCE,
  PLAN_LABELS,
  PLAN_TIERS,
  effectiveTier,
  formatGbp,
  monthStartUtc,
  paymentLinkFor,
  type BillingConfig,
  type PlanTier,
  type TenantBilling,
} from '@mbh/domain';
import { useApp } from '../context';
import { getReader } from '../../lib/reader';

// A shipper's plan: what they are on, how much of this month's allowance is
// used, and the way to change it. Paying happens on Stripe's own pages (a
// payment link, the customer portal) — this page never touches a card, and
// never calls Stripe: the plan shown is what Stripe's webhook last told us.

const PLAN_BLURBS: Record<PlanTier, string> = {
  starter: 'For a shipper with the odd load to move.',
  growth: 'For a regular flow of backhauls every week.',
  fleet: 'Unlimited loads, for a shipper running at volume.',
};

function allowanceLabel(tier: PlanTier | 'free'): string {
  const allowance = MONTHLY_LOAD_ALLOWANCE[tier];
  return allowance === null ? 'Unlimited loads' : `${allowance} loads a month`;
}

function formatDay(iso: string | undefined): string {
  if (iso === undefined) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

type State =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; config: BillingConfig; billing: TenantBilling | null; posted: number };

export default function Billing() {
  const app = useApp();
  const [params] = useSearchParams();
  const tenantId = app.selected?.tenantId;
  const isOwner = app.selected?.role === 'owner';
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (tenantId === undefined) return;
    let cancelled = false;
    const reader = getReader();
    Promise.all([
      reader.billingConfig(),
      reader.tenantBilling(tenantId),
      reader.loadsPostedSince(tenantId, monthStartUtc(new Date().toISOString())),
    ])
      .then(([config, billing, posted]) => {
        if (!cancelled) setState({ kind: 'ready', config, billing, posted });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const email = app.auth.session?.email ?? null;
  const tier = state.kind === 'ready' ? effectiveTier(state.billing ?? undefined) : 'free';
  const allowance = MONTHLY_LOAD_ALLOWANCE[tier];

  const portalHref = useMemo(() => {
    if (state.kind !== 'ready' || state.config.portalUrl === '') return null;
    return email !== null ? `${state.config.portalUrl}?prefilled_email=${encodeURIComponent(email)}` : state.config.portalUrl;
  }, [state, email]);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Billing</h1>
        <p className="text-gray-600">Your plan sets how many loads you can post each month. Carrying loads is always free.</p>
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
                  {state.billing?.override ? (
                    <>Provided by MyBackHaul{state.billing.override.note ? ` — ${state.billing.override.note}` : ''}.</>
                  ) : state.billing?.status === 'past_due' ? (
                    <span className="text-amber-700">
                      Your last payment did not go through. Stripe is retrying — update your card to keep your plan.
                    </span>
                  ) : state.billing?.cancelAtPeriodEnd && state.billing.currentPeriodEnd ? (
                    <>Ends on {formatDay(state.billing.currentPeriodEnd)}.</>
                  ) : tier !== 'free' && state.billing?.currentPeriodEnd ? (
                    <>Renews on {formatDay(state.billing.currentPeriodEnd)}.</>
                  ) : (
                    <>The free allowance.</>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Loads posted this month</p>
                <p className="text-2xl font-bold text-gray-900 tabular-nums">
                  {state.posted}
                  {allowance !== null && <span className="text-gray-400 font-medium"> / {allowance}</span>}
                </p>
              </div>
            </div>
            {allowance !== null && (
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
                Plans are not being enforced yet, so you can post as many loads as you need for now.
              </p>
            )}
            {portalHref !== null && state.billing?.stripeCustomerId !== undefined && isOwner && (
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
            <div className="grid md:grid-cols-3 gap-4">
              {PLAN_TIERS.map((plan) => {
                const link = state.config.paymentLinks[plan];
                const price = state.config.monthlyPricePence[plan];
                const current = tier === plan;
                return (
                  <div
                    key={plan}
                    className={`bg-white rounded-2xl shadow-md border p-5 flex flex-col ${current ? 'border-blue-500' : 'border-gray-100'}`}
                  >
                    <h3 className="text-lg font-bold text-gray-900">{PLAN_LABELS[plan]}</h3>
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
                    <p className="text-sm font-medium text-gray-800 mt-2">{allowanceLabel(plan)}</p>
                    <p className="text-sm text-gray-600 mt-1 flex-1">{PLAN_BLURBS[plan]}</p>
                    <div className="mt-4">
                      {current ? (
                        <span className="inline-flex items-center gap-1.5 text-blue-700 font-medium">
                          <Check className="w-4 h-4" /> Your plan
                        </span>
                      ) : link === undefined ? (
                        <span className="text-sm text-gray-500">Opening soon</span>
                      ) : !isOwner ? (
                        <span className="text-sm text-gray-500">Ask your company’s owner to change plan</span>
                      ) : state.billing?.stripeSubscriptionId !== undefined &&
                        state.billing.status !== 'canceled' &&
                        portalHref !== null ? (
                        // Already subscribed: changing plan happens in the
                        // portal, so the old subscription is replaced rather
                        // than a second one started beside it.
                        <a
                          href={portalHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700"
                        >
                          Switch to {PLAN_LABELS[plan]}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      ) : (
                        <a
                          href={paymentLinkFor(link, tenantId ?? '', email)}
                          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700"
                        >
                          Choose {PLAN_LABELS[plan]}
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-sm text-gray-500 mt-3">
              Without a plan you can post {MONTHLY_LOAD_ALLOWANCE.free} loads a month free. Payment is taken by Stripe; we
              never see your card.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
