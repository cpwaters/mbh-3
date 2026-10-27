import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { formatGbp, type Job, type JobStatus } from '@mbh/domain';
import {
  JOB_STATUS_LABELS,
  JOB_STATUS_STYLES,
  Pill,
  byNewest,
  companyName,
  formatDay,
  personName,
  useAdminData,
  type AdminData,
} from './adminData';

// Every job: who posted it, who is carrying it, who is driving, where it is
// in its life. Read-only on purpose — a job is the shared legal record, and
// it changes only by the parties' own events.
export function JobList({ jobs, data }: { jobs: Job[]; data: AdminData }) {
  if (jobs.length === 0) {
    return <p className="text-sm text-gray-500 p-4">No jobs.</p>;
  }
  return (
    <ul className="divide-y divide-gray-100">
      {jobs.map((job) => (
        <li key={job.jobId} className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Pill className={JOB_STATUS_STYLES[job.status]}>{JOB_STATUS_LABELS[job.status]}</Pill>
            <span className="font-medium text-gray-900 inline-flex items-center gap-1.5">
              {job.origin.town} <ArrowRight className="w-3.5 h-3.5 text-gray-400" /> {job.destination.town}
            </span>
            <span className="text-gray-700">{formatGbp(job.priceGbpPence)}</span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            <Link to={`/admin/companies/${job.shipperTenantId}`} className="text-indigo-700 hover:underline">
              {companyName(data.companies, job.shipperTenantId)}
            </Link>
            {' → '}
            <Link to={`/admin/companies/${job.carrierTenantId}`} className="text-indigo-700 hover:underline">
              {companyName(data.companies, job.carrierTenantId)}
            </Link>
            {' · driver '}
            {personName(data, job.driverActorId)} · accepted {formatDay(job.createdAt)}
            {job.deliveredAt !== undefined && <> · delivered {formatDay(job.deliveredAt)}</>}
          </p>
        </li>
      ))}
    </ul>
  );
}

const FILTERS: { value: JobStatus | 'live' | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'live', label: 'Under way' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'closed', label: 'Closed' },
];

const LIVE: readonly JobStatus[] = ['accepted', 'collected', 'in_transit'];

function Jobs({ data }: { data: AdminData }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all');
  const jobs = useMemo(
    () =>
      [...data.jobs]
        .filter((j) => filter === 'all' || (filter === 'live' ? LIVE.includes(j.status) : j.status === filter))
        .sort(byNewest),
    [data, filter]
  );
  return (
    <>
      <div className="flex gap-1 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap ${
              filter === f.value ? 'bg-indigo-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="bg-white rounded-2xl shadow-md border border-gray-100">
        <JobList jobs={jobs} data={data} />
      </div>
    </>
  );
}

export function AdminJobs() {
  const { state } = useAdminData();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Jobs</h2>
        <p className="text-gray-600 mt-1">
          Every accepted load, from collection to PoD. The record belongs to the shipper and carrier, so it is
          read-only here.
        </p>
      </div>
      {state.kind === 'loading' && <p className="text-gray-600">Loading jobs…</p>}
      {state.kind === 'error' && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {state.message}
        </div>
      )}
      {state.kind === 'ready' && <Jobs data={state.data} />}
    </div>
  );
}
