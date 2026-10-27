import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Ban, Search } from 'lucide-react';
import { formatGbp, type Load, type LoadStatus } from '@mbh/domain';
import {
  LOAD_STATUS_LABELS,
  LOAD_STATUS_STYLES,
  Pill,
  byNewest,
  companyName,
  formatDay,
  useAdminAction,
  useAdminData,
  type AdminData,
} from './adminData';

// Every load on the marketplace, and the one control the founder has over a
// load: withdrawing one that is still on offer. A load that has been taken
// lives on as a job, which is corrected through the job, not here.
export function LoadList({
  loads,
  data,
  onChanged,
  showCompany = true,
}: {
  loads: Load[];
  data: AdminData;
  onChanged: () => void;
  showCompany?: boolean;
}) {
  const { run, busy, error } = useAdminAction(onChanged);
  const [confirming, setConfirming] = useState<string | null>(null);

  if (loads.length === 0) {
    return <p className="text-sm text-gray-500 p-4">No loads.</p>;
  }

  return (
    <>
      {error !== null && (
        <div role="alert" className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}
      <ul className="divide-y divide-gray-100">
        {loads.map((load) => (
          <li key={load.loadId} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Pill className={LOAD_STATUS_STYLES[load.status]}>{LOAD_STATUS_LABELS[load.status]}</Pill>
                <span className="font-medium text-gray-900 inline-flex items-center gap-1.5">
                  {load.origin.town} <ArrowRight className="w-3.5 h-3.5 text-gray-400" /> {load.destination.town}
                </span>
                <span className="text-gray-700">{formatGbp(load.priceGbpPence)}</span>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {showCompany && (
                  <>
                    <Link to={`/admin/companies/${load.tenantId}`} className="text-indigo-700 hover:underline">
                      {companyName(data.companies, load.tenantId)}
                    </Link>
                    {' · '}
                  </>
                )}
                Posted {formatDay(load.createdAt)} · collect by {formatDay(load.pickupBy)} ·{' '}
                {load.consignment.palletCount} pallets, {load.consignment.weightKg.toLocaleString('en-GB')} kg
              </p>
            </div>
            {load.status === 'available' &&
              (confirming === load.loadId ? (
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void run('cancelLoad', { shipperTenantId: load.tenantId, loadId: load.loadId }).then(() =>
                        setConfirming(null)
                      )
                    }
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60"
                  >
                    {busy ? 'Withdrawing…' : 'Yes, withdraw it'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    className="px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirming(load.loadId)}
                  className="px-3 py-1.5 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 inline-flex items-center gap-1.5 shrink-0"
                >
                  <Ban className="w-4 h-4" />
                  Withdraw load
                </button>
              ))}
          </li>
        ))}
      </ul>
    </>
  );
}

const FILTERS: { value: LoadStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'available', label: 'On offer' },
  { value: 'matched', label: 'Taken' },
  { value: 'fulfilled', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

function Loads({ data, reload }: { data: AdminData; reload: () => void }) {
  const [filter, setFilter] = useState<LoadStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();

  const loads = useMemo(
    () =>
      [...data.loads]
        .filter((l) => filter === 'all' || l.status === filter)
        .filter(
          (l) =>
            needle === '' ||
            l.origin.town.toLowerCase().includes(needle) ||
            l.destination.town.toLowerCase().includes(needle) ||
            l.origin.postcode.toLowerCase().includes(needle) ||
            l.destination.postcode.toLowerCase().includes(needle) ||
            companyName(data.companies, l.tenantId).toLowerCase().includes(needle)
        )
        .sort(byNewest),
    [data, filter, needle]
  );

  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
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
        <label className="relative sm:w-72">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            aria-label="Search loads"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Town, postcode or company"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      </div>
      <div className="bg-white rounded-2xl shadow-md border border-gray-100">
        <LoadList loads={loads} data={data} onChanged={reload} />
      </div>
    </>
  );
}

export function AdminLoads() {
  const { state, reload } = useAdminData();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Loads</h2>
        <p className="text-gray-600 mt-1">
          Everything shippers have posted. A load still on offer can be withdrawn; once taken, it is a job.
        </p>
      </div>
      {state.kind === 'loading' && <p className="text-gray-600">Loading loads…</p>}
      {state.kind === 'error' && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {state.message}
        </div>
      )}
      {state.kind === 'ready' && <Loads data={state.data} reload={reload} />}
    </div>
  );
}
