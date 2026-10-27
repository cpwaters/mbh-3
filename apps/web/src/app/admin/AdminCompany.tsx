import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, PauseCircle, PlayCircle } from 'lucide-react';
import { isTenantSuspended, isValidSuspensionReason, type Tenant } from '@mbh/domain';
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
