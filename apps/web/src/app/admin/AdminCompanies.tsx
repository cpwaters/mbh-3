import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ChevronRight, Search } from 'lucide-react';
import { isTenantSuspended, type Tenant } from '@mbh/domain';
import { Pill, byNewest, formatDay, useAdminData, type AdminData } from './adminData';

type Filter = 'all' | 'shipper' | 'carrier' | 'suspended';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'shipper', label: 'Shippers' },
  { value: 'carrier', label: 'Carriers' },
  { value: 'suspended', label: 'Suspended' },
];

function matches(company: Tenant, filter: Filter, search: string): boolean {
  if (filter === 'suspended' && !isTenantSuspended(company)) return false;
  if ((filter === 'shipper' || filter === 'carrier') && !company.capabilities.includes(filter)) return false;
  return search === '' || company.name.toLowerCase().includes(search);
}

export function CapabilityPills({ company }: { company: Tenant }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {company.capabilities.includes('shipper') && <Pill className="bg-sky-100 text-sky-800">Shipper</Pill>}
      {company.capabilities.includes('carrier') && <Pill className="bg-orange-100 text-orange-800">Carrier</Pill>}
      {isTenantSuspended(company) && <Pill className="bg-red-100 text-red-800">Suspended</Pill>}
    </span>
  );
}

function CompanyRows({ data }: { data: AdminData }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();

  const rows = useMemo(
    () =>
      [...data.companies]
        .filter((c) => matches(c, filter, needle))
        .sort(byNewest)
        .map((company) => ({
          company,
          people: data.members.filter((m) => m.tenantId === company.tenantId).length,
          loads: data.loads.filter((l) => l.tenantId === company.tenantId).length,
          jobs: data.jobs.filter((j) => j.carrierTenantId === company.tenantId).length,
        })),
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
            aria-label="Search companies"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-10 text-center text-gray-600">
          No companies match.
        </div>
      ) : (
        <ul className="bg-white rounded-2xl shadow-md border border-gray-100 divide-y divide-gray-100">
          {rows.map(({ company, people, loads, jobs }) => (
            <li key={company.tenantId}>
              <Link
                to={`/admin/companies/${company.tenantId}`}
                className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-gray-900 truncate">{company.name}</span>
                    <CapabilityPills company={company} />
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Joined {formatDay(company.createdAt)} · {people} {people === 1 ? 'person' : 'people'} · {loads}{' '}
                    {loads === 1 ? 'load' : 'loads'} posted · {jobs} {jobs === 1 ? 'job' : 'jobs'} carried
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function AdminCompanies() {
  const { state } = useAdminData();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Companies</h2>
        <p className="text-gray-600 mt-1">Every shipper and carrier on the marketplace. Open one to manage it.</p>
      </div>
      {state.kind === 'loading' && <p className="text-gray-600">Loading companies…</p>}
      {state.kind === 'error' && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {state.message}
        </div>
      )}
      {state.kind === 'ready' && <CompanyRows data={state.data} />}
    </div>
  );
}
