import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, PauseCircle, PlayCircle } from 'lucide-react';
import {
  FREE_PLAN_DAYS,
  PLAN_LABELS,
  PLAN_TIERS,
  activeOverride,
  effectivePlan,
  isShipperTier,
  isTenantSuspended,
  trialDaysLeft,
  isValidSuspensionReason,
  type PlanTier,
  type Tenant,
} from '@mbh/domain';
import { PlanSource } from './AdminBilling';
import { byNewest, formatDay, formatWhen, useAdminAction, useAdminData, type AdminData } from './adminData';
import { CapabilityPills } from './AdminCompanies';
import { MemberList } from './AdminPeople';
import { LoadList } from './AdminLoads';
import { JobList } from './AdminJobs';

const LIVE_JOB = ['accepted', 'collected', 'in_transit'];

// Suspending is the heaviest control in the back office, so it asks for a
// reason (the company is shown it) and spells out what will stop before it
// does anything.
function Standing({ company, data, onChanged }: { company: Tenant; data: AdminData; onChanged: () => void }) {
  const { run, busy, error } = useAdminAction(onChanged);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const suspended = isTenantSuspended(company);
  const onOffer = data.loads.filter((l) => l.tenantId === company.tenantId && l.status === 'available').length;
  const underWay = data.jobs.filter(
    (j) => (j.carrierTenantId === company.tenantId || j.shipperTenantId === company.tenantId) && LIVE_JOB.includes(j.status)
  ).length;

  if (suspended) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
        <h3 className="font-bold text-red-900">Suspended</h3>
        <p className="text-sm text-red-800 mt-1">
          Since {formatWhen(company.suspendedAt)} — “{company.suspendedReason}”. Its people can sign in and read their
          records but cannot act, and its loads are off the browse.
        </p>
        {error !== null && (
          <p role="alert" className="text-sm text-red-800 mt-2 font-medium">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => void run('reinstateCompany', { tenantId: company.tenantId })}
          className="mt-3 inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-60"
        >
          <PlayCircle className="w-4 h-4" />
          {busy ? 'Reinstating…' : 'Reinstate company'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5">
      <h3 className="font-bold text-gray-900">Standing</h3>
      <p className="text-sm text-gray-600 mt-1">Trading normally.</p>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 inline-flex items-center gap-2 border border-red-300 text-red-600 px-4 py-2 rounded-lg font-medium hover:bg-red-50"
        >
          <PauseCircle className="w-4 h-4" />
          Suspend company
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-gray-700">
            Nobody at {company.name} will be able to act — post, accept, collect or deliver.
            {onOffer > 0 && ` Its ${onOffer} load${onOffer === 1 ? '' : 's'} on offer will leave the browse.`}
            {underWay > 0 && (
              <strong className="text-red-700">
                {' '}
                {underWay} job{underWay === 1 ? ' is' : 's are'} under way, and {underWay === 1 ? 'its driver' : 'their drivers'}{' '}
                will not be able to record collection or PoD.
              </strong>
            )}
          </p>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Reason (shown to the company)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Insurance certificate expired"
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-red-500"
            />
          </label>
          {error !== null && (
            <p role="alert" className="text-sm text-red-700 font-medium">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !isValidSuspensionReason(reason)}
              onClick={() =>
                void run('suspendCompany', { tenantId: company.tenantId, reason: reason.trim() }).then((ok) => {
                  if (ok) {
                    setOpen(false);
                    setReason('');
                  }
                })
              }
              className="bg-red-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-red-700 disabled:opacity-60"
            >
              {busy ? 'Suspending…' : 'Suspend'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// A company's plan, and the founder's override: give a plan without payment
// (a pilot customer) or take that back, leaving whatever Stripe says. Only
// the plans the company can use are offered — shipper plans to a company
// that posts, the Driver plan to one that carries.
function Plan({ company, onChanged }: { company: Tenant; onChanged: () => void }) {
  const { run, busy, error } = useAdminAction(onChanged);
  const now = new Date().toISOString();
  const override = activeOverride(company.billing, now);
  const lapsed = override === null ? (company.billing?.override ?? null) : null;
  const options = PLAN_TIERS.filter((t) =>
    isShipperTier(t) ? company.capabilities.includes('shipper') : company.capabilities.includes('carrier')
  );
  const [tier, setTier] = useState<PlanTier>(options[0] ?? 'driver');
  const [days, setDays] = useState<number | null>(14);
  const [note, setNote] = useState('');
  const effective = effectivePlan(company, now);

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold text-gray-900">Plan</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-gray-900">{PLAN_LABELS[effective]}</span>
          <PlanSource company={company} />
          {effective === 'trial' && (
            <span className="text-sm text-gray-600">ends in {trialDaysLeft(company, now)} days</span>
          )}
        </div>
      </div>
      {override !== null ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-gray-600">
            Given by you on {formatDay(override.setAt)}
            {override.expiresAt != null ? `, until ${formatDay(override.expiresAt)}` : ', with no end date'}
            {override.note !== '' ? ` — “${override.note}”` : ''}.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run('setCompanyPlan', { tenantId: company.tenantId, tier: null })}
            className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
          >
            Remove — back to what they pay for
          </button>
        </div>
      ) : (
        // One field under another: the choices read top to bottom as a
        // sentence — this plan, for this long, because of this — and stay
        // usable on a phone.
        <div className="flex flex-col gap-3 max-w-md">
          {lapsed !== null && lapsed.expiresAt != null && (
            <p className="text-sm text-gray-600">
              The {PLAN_LABELS[lapsed.tier]} plan you gave ended on {formatDay(lapsed.expiresAt)}.
            </p>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Plan to give</span>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as PlanTier)}
              className="px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              {options.map((t) => (
                <option key={t} value={t}>
                  {PLAN_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">For how long</span>
            <select
              value={days === null ? 'none' : String(days)}
              onChange={(e) => setDays(e.target.value === 'none' ? null : Number(e.target.value))}
              className="px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              {FREE_PLAN_DAYS.map((d) => (
                <option key={d ?? 'none'} value={d === null ? 'none' : String(d)}>
                  {d === null ? 'No end date' : `${d} days`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-gray-700">Why</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. pilot customer"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run('setCompanyPlan', { tenantId: company.tenantId, tier, days, note: note.trim() })
            }
            className="self-start px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
          >
            Give plan free
          </button>
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-sm text-red-700 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

// Location tracking for the whole company. What "off" means depends on what
// the company does, so it is spelt out for each side it trades on.
function Tracking({ company, data, onChanged }: { company: Tenant; data: AdminData; onChanged: () => void }) {
  const { run, busy, error } = useAdminAction(onChanged);
  const on = company.trackingDisabled !== true;
  const underWay = data.jobs.filter(
    (j) => (j.carrierTenantId === company.tenantId || j.shipperTenantId === company.tenantId) && LIVE_JOB.includes(j.status)
  ).length;
  const effects = [
    company.capabilities.includes('shipper') ? 'its loads are not followed on a map' : null,
    company.capabilities.includes('carrier') ? 'its drivers’ phones report no position' : null,
  ].filter((e): e is string => e !== null);

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-gray-900 inline-flex items-center gap-2">
            {on ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-gray-500" />}
            Location tracking {on ? 'on' : 'off'}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Off: {effects.join(', and ')}.
            {underWay > 0 && ` Applies straight away to the ${underWay} job${underWay === 1 ? '' : 's'} under way.`}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={`Location tracking for ${company.name}`}
          disabled={busy}
          onClick={() => void run('setCompanyTracking', { tenantId: company.tenantId, enabled: !on })}
          className={`px-4 py-2 rounded-lg font-medium disabled:opacity-60 ${
            on ? 'border border-gray-300 text-gray-700 hover:bg-gray-50' : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {busy ? 'Saving…' : on ? 'Switch tracking off' : 'Switch tracking on'}
        </button>
      </div>
      {error !== null && (
        <p role="alert" className="text-sm text-red-700 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl shadow-md border border-gray-100">
      <h3 className="font-bold text-gray-900 px-4 pt-4">{title}</h3>
      {children}
    </section>
  );
}

function Company({ company, data, reload }: { company: Tenant; data: AdminData; reload: () => void }) {
  const members = data.members.filter((m) => m.tenantId === company.tenantId).sort(byNewest);
  const loads = data.loads.filter((l) => l.tenantId === company.tenantId).sort(byNewest);
  const jobs = data.jobs
    .filter((j) => j.carrierTenantId === company.tenantId || j.shipperTenantId === company.tenantId)
    .sort(byNewest);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-bold text-gray-900">{company.name}</h2>
          <CapabilityPills company={company} />
        </div>
        <p className="text-gray-600 mt-1">Joined {formatDay(company.createdAt)}</p>
      </div>

      <Standing company={company} data={data} onChanged={reload} />

      <Plan company={company} onChanged={reload} />

      <Tracking company={company} data={data} onChanged={reload} />

      <Section title={`People (${members.length})`}>
        <MemberList members={members} data={data} onChanged={reload} showCompany={false} />
      </Section>

      {company.capabilities.includes('shipper') && (
        <Section title={`Loads posted (${loads.length})`}>
          <LoadList loads={loads} data={data} onChanged={reload} showCompany={false} />
        </Section>
      )}

      <Section title={`Jobs (${jobs.length})`}>
        <JobList jobs={jobs} data={data} />
      </Section>
    </div>
  );
}

export function AdminCompany() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { state, reload } = useAdminData();
  const company = state.kind === 'ready' ? state.data.companies.find((c) => c.tenantId === tenantId) : undefined;

  return (
    <div className="space-y-4">
      <Link to="/admin/companies" className="inline-flex items-center gap-1.5 text-sm text-indigo-700 hover:underline">
        <ArrowLeft className="w-4 h-4" />
        All companies
      </Link>
      {state.kind === 'loading' && <p className="text-gray-600">Loading company…</p>}
      {state.kind === 'error' && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {state.message}
        </div>
      )}
      {state.kind === 'ready' && company === undefined && <p className="text-gray-600">No such company.</p>}
      {state.kind === 'ready' && company !== undefined && <Company company={company} data={state.data} reload={reload} />}
    </div>
  );
}
