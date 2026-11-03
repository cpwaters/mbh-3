import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PICKUP_ALLOWANCE,
  POSTING_ALLOWANCE,
  allowancePeriodStart,
  PLAN_LABELS,
  PLAN_TIERS,
  activeOverride,
  effectivePlan,
  formatGbp,
  isShipperTier,
  trialDaysLeft,
  isStripePaymentLink,
  isStripePortalUrl,
  monthStartUtc,
  type BillingConfig,
  type PlanTier,
  type Tenant,
} from '@mbh/domain';
import { getReader } from '../../lib/reader';
import { Pill, formatDay, useAdminAction, useAdminData, type AdminData } from './adminData';

// The founder's billing switchboard and the plan every company is on.
//
// Everything here is public Stripe configuration — payment links, the portal
// login page, display prices. The webhook signing secret is deliberately not
// here: it lives only in the function's environment (a GitHub Actions secret),
// so nobody with a browser, the founder included, can read or change it.

interface Form {
  enforced: boolean;
  links: Record<PlanTier, string>;
  prices: Record<PlanTier, string>; // pounds, as typed
  portalUrl: string;
}

function toForm(config: BillingConfig): Form {
  const links = Object.fromEntries(PLAN_TIERS.map((t) => [t, ''])) as Record<PlanTier, string>;
  const prices = Object.fromEntries(PLAN_TIERS.map((t) => [t, ''])) as Record<PlanTier, string>;
  for (const tier of PLAN_TIERS) {
    links[tier] = config.paymentLinks[tier] ?? '';
    const pence = config.monthlyPricePence[tier];
    prices[tier] = pence !== undefined ? (pence / 100).toFixed(2) : '';
  }
  return { enforced: config.enforced, links, prices, portalUrl: config.portalUrl };
}

function pence(pounds: string): number | undefined {
  const n = Number(pounds.trim());
  return pounds.trim() === '' || !Number.isFinite(n) || n <= 0 ? undefined : Math.round(n * 100);
}

function Switchboard({ config, onSaved }: { config: BillingConfig; onSaved: () => void }) {
  const [form, setForm] = useState<Form>(() => toForm(config));
  const [saved, setSaved] = useState(false);
  const { run, busy, error } = useAdminAction(onSaved);

  const badLink = PLAN_TIERS.find((t) => form.links[t] !== '' && !isStripePaymentLink(form.links[t].trim()));
  const badPortal = form.portalUrl !== '' && !isStripePortalUrl(form.portalUrl.trim());

  async function save(): Promise<void> {
    setSaved(false);
    const monthlyPricePence: Partial<Record<PlanTier, number>> = {};
    for (const tier of PLAN_TIERS) {
      const p = pence(form.prices[tier]);
      if (p !== undefined) monthlyPricePence[tier] = p;
    }
    const ok = await run('setBillingConfig', {
      enforced: form.enforced,
      paymentLinks: form.links,
      portalUrl: form.portalUrl,
      monthlyPricePence,
    });
    setSaved(ok);
  }

  return (
    <section className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 space-y-5">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Stripe links</h3>
        <p className="text-sm text-gray-600">
          Paste what <code className="text-xs">pnpm stripe:provision</code> printed (see docs/runbooks/billing.md). Shippers
          are sent to these; nothing here is secret.
        </p>
      </div>

      <div className="grid gap-4">
        {PLAN_TIERS.map((tier) => (
          <div key={tier} className="grid sm:grid-cols-[10rem_1fr_9rem] gap-2 sm:items-center">
            <span className="font-medium text-gray-800">
              {PLAN_LABELS[tier]}{' '}
              <span className="text-xs text-gray-500">
                (
                {!isShipperTier(tier)
                  ? `${PICKUP_ALLOWANCE[tier]?.count} pick-ups/mo`
                  : POSTING_ALLOWANCE[tier] === null
                    ? 'unlimited'
                    : `${POSTING_ALLOWANCE[tier]?.count}/mo`}
                )
              </span>
            </span>
            <input
              aria-label={`${PLAN_LABELS[tier]} payment link`}
              value={form.links[tier]}
              onChange={(e) => setForm({ ...form, links: { ...form.links, [tier]: e.target.value } })}
              placeholder="https://buy.stripe.com/…"
              className="px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 min-w-0"
            />
            <label className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">£</span>
              <input
                aria-label={`${PLAN_LABELS[tier]} monthly price`}
                inputMode="decimal"
                value={form.prices[tier]}
                onChange={(e) => setForm({ ...form, prices: { ...form.prices, [tier]: e.target.value } })}
                placeholder="per month"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>
          </div>
        ))}
        <div className="grid sm:grid-cols-[10rem_1fr] gap-2 sm:items-center">
          <span className="font-medium text-gray-800">Customer portal</span>
          <input
            aria-label="Customer portal link"
            value={form.portalUrl}
            onChange={(e) => setForm({ ...form, portalUrl: e.target.value })}
            placeholder="https://billing.stripe.com/p/login/…"
            className="px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 min-w-0"
          />
        </div>
      </div>

      <label className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
        <input
          type="checkbox"
          checked={form.enforced}
          onChange={(e) => setForm({ ...form, enforced: e.target.checked })}
          className="mt-1"
        />
        <span className="text-sm text-amber-900">
          <strong>Enforce plans.</strong> Shippers past their monthly allowance can no longer post loads until they
          upgrade. Off, the allowances are shown but nobody is stopped. Only switch on once the webhook is live and a
          test subscription has come through.
        </span>
      </label>

      {badLink !== undefined && (
        <p className="text-sm text-red-700">The {PLAN_LABELS[badLink]} link is not a Stripe payment link.</p>
      )}
      {badPortal && <p className="text-sm text-red-700">The portal link is not a Stripe customer portal login link.</p>}
      {error !== null && (
        <p role="alert" className="text-sm text-red-700 font-medium">
          {error}
        </p>
      )}
      {saved && error === null && (
        <p role="status" className="text-sm text-emerald-700">
          Saved.
        </p>
      )}

      <button
        type="button"
        disabled={busy || badLink !== undefined || badPortal}
        onClick={() => void save()}
        className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60"
      >
        {busy ? 'Saving…' : 'Save billing settings'}
      </button>
    </section>
  );
}

export function PlanSource({ company }: { company: Tenant }) {
  const b = company.billing;
  if (activeOverride(b, new Date().toISOString()) !== null) {
    return <Pill className="bg-indigo-100 text-indigo-800">Given by you</Pill>;
  }
  if (b?.status === undefined && effectivePlan(company, new Date().toISOString()) === 'trial') {
    return <Pill className="bg-sky-100 text-sky-800">Trial</Pill>;
  }
  if (b?.status === undefined) return <Pill className="bg-gray-100 text-gray-600">No subscription</Pill>;
  const styles: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800',
    trialing: 'bg-emerald-100 text-emerald-800',
    past_due: 'bg-amber-100 text-amber-800',
  };
  return <Pill className={styles[b.status] ?? 'bg-red-100 text-red-800'}>Stripe: {b.status.replace('_', ' ')}</Pill>;
}

function Companies({ data }: { data: AdminData }) {
  const now = new Date().toISOString();
  const rows = useMemo(
    () =>
      [...data.companies]
        .map((company) => {
          const tier = effectivePlan(company, now);
          // Counted over whichever period the company's allowance runs on —
          // today (UK) without a plan, this month on a shipper plan.
          const posting = POSTING_ALLOWANCE[tier];
          const pickup = PICKUP_ALLOWANCE[tier];
          const postingSince = posting !== null ? allowancePeriodStart(posting, now) : monthStartUtc(now);
          const pickupSince = pickup !== null ? allowancePeriodStart(pickup, now) : null;
          return {
            company,
            tier,
            posting,
            pickup,
            posted: data.loads.filter((l) => l.tenantId === company.tenantId && (l.createdAt ?? '') >= postingSince)
              .length,
            pickedUp:
              pickupSince === null
                ? 0
                : data.jobs.filter((j) => j.carrierTenantId === company.tenantId && (j.createdAt ?? '') >= pickupSince)
                    .length,
          };
        })
        .sort((a, b) => a.company.name.localeCompare(b.company.name)),
    [data, now]
  );

  const paying = rows.filter(
    (r) => activeOverride(r.company.billing, now) === null && r.tier !== 'free' && r.tier !== 'trial'
  ).length;
  const inTrial = rows.filter((r) => r.tier === 'trial').length;

  return (
    <section className="bg-white rounded-2xl shadow-md border border-gray-100">
      <div className="p-4">
        <h3 className="text-lg font-bold text-gray-900">Companies</h3>
        <p className="text-sm text-gray-600">
          {rows.length} compan{rows.length === 1 ? 'y' : 'ies'} · {paying} paying through Stripe · {inTrial} in their
          free trial. Open one to give or take away a plan.
        </p>
      </div>
      <ul className="divide-y divide-gray-100">
        {rows.map(({ company, tier, posting, pickup, posted, pickedUp }) => {
          const ships = company.capabilities.includes('shipper');
          const carries = company.capabilities.includes('carrier');
          return (
            <li key={company.tenantId} className="p-4 flex flex-col sm:flex-row sm:items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/admin/companies/${company.tenantId}`} className="font-medium text-indigo-700 hover:underline">
                    {company.name}
                  </Link>
                  <span className="font-semibold text-gray-900">{PLAN_LABELS[tier]}</span>
                  <PlanSource company={company} />
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {ships && company.capabilities.includes('carrier') ? 'Shipper and carrier' : ships ? 'Shipper' : 'Driver'}
                  {tier === 'trial' && ` · trial ends in ${trialDaysLeft(company, now)} days`}
                  {company.billing?.currentPeriodEnd !== undefined &&
                    activeOverride(company.billing, now) === null &&
                    ` · ${company.billing.cancelAtPeriodEnd ? 'ends' : 'renews'} ${formatDay(company.billing.currentPeriodEnd)}`}
                </p>
              </div>
              <div className="text-sm text-gray-700 tabular-nums sm:text-right">
                {ships && (
                  <p>
                    {posted}
                    {posting !== null ? ` / ${posting.count}` : ''} posted{' '}
                    {posting?.per === 'day' ? 'today' : 'this month'}
                  </p>
                )}
                {carries && pickup !== null && (
                  <p>
                    {pickedUp} / {pickup.count} picked up {pickup.per === 'day' ? 'today' : 'this month'}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function AdminBilling() {
  const { state } = useAdminData();
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReader()
      .billingConfig()
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        if (!cancelled) setError('Could not read the billing settings.');
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const prices = config === null ? [] : PLAN_TIERS.filter((t) => config.monthlyPricePence[t] !== undefined);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Billing</h2>
        <p className="text-gray-600 mt-1">
          Everyone gets a 30-day free trial. After it, without a plan, a company can post one load and pick up one
          load a day; shipper plans lift posting, the Driver plans lift pick-ups.{' '}
          {config !== null &&
            (config.enforced ? (
              <strong className="text-emerald-700">Plans are enforced.</strong>
            ) : (
              <strong className="text-amber-700">Plans are not enforced yet.</strong>
            ))}
          {prices.length > 0 &&
            config !== null &&
            ` ${prices.map((t) => `${PLAN_LABELS[t]} ${formatGbp(config.monthlyPricePence[t] as number)}`).join(' · ')}`}
        </p>
      </div>
      {(error ?? (state.kind === 'error' ? state.message : null)) !== null && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {error ?? (state.kind === 'error' ? state.message : '')}
        </div>
      )}
      {config === null && error === null && <p className="text-gray-600">Loading billing…</p>}
      {/* Not re-keyed on save: the form already shows what was saved, and
          remounting it would throw away the "Saved." confirmation. */}
      {config !== null && <Switchboard config={config} onSaved={() => setVersion((v) => v + 1)} />}
      {state.kind === 'ready' && <Companies data={state.data} />}
    </div>
  );
}
