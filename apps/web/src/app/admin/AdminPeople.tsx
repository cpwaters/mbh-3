import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { Member, Role } from '@mbh/domain';
import {
  Pill,
  ROLE_LABELS,
  byNewest,
  companyName,
  formatDay,
  useAdminAction,
  useAdminData,
  type AdminData,
} from './adminData';

const ROLES: readonly Role[] = ['owner', 'dispatcher', 'driver'];

// One row per membership: a person who works for two companies is two rows,
// because their role and their standing are per company.
export function MemberList({
  members,
  data,
  onChanged,
  showCompany = true,
}: {
  members: Member[];
  data: AdminData;
  onChanged: () => void;
  showCompany?: boolean;
}) {
  const { run, busy, error } = useAdminAction(onChanged);

  if (members.length === 0) {
    return <p className="text-sm text-gray-500 p-4">Nobody.</p>;
  }

  return (
    <>
      {error !== null && (
        <div role="alert" className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}
      <ul className="divide-y divide-gray-100">
        {members.map((member) => {
          const person = data.people.find((p) => p.actorId === member.actorId);
          const name = person?.displayName || member.displayName || member.actorId;
          const disabled = member.status !== 'active';
          // Only a carrier's people carry loads, so only they have a phone
          // worth switching off.
          const carries =
            data.companies.find((c) => c.tenantId === member.tenantId)?.capabilities.includes('carrier') ?? false;
          const tracked = member.trackingDisabled !== true;
          return (
            <li
              key={`${member.tenantId}/${member.actorId}`}
              className="p-4 flex flex-col sm:flex-row sm:items-center gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-medium ${disabled ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{name}</span>
                  {disabled && <Pill className="bg-gray-100 text-gray-600">Disabled</Pill>}
                  {carries && !tracked && <Pill className="bg-gray-100 text-gray-600">Not tracked</Pill>}
                </div>
                <p className="text-sm text-gray-500 mt-0.5 break-all">
                  {showCompany && (
                    <>
                      <Link to={`/admin/companies/${member.tenantId}`} className="text-indigo-700 hover:underline">
                        {companyName(data.companies, member.tenantId)}
                      </Link>
                      {' · '}
                    </>
                  )}
                  {person?.email || 'no email on profile'}
                  {person?.phone ? ` · ${person.phone}` : ''} · joined {formatDay(member.createdAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {carries && (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={tracked}
                    aria-label={`Location tracking for ${name}`}
                    disabled={busy}
                    onClick={() =>
                      void run('setMemberTracking', {
                        tenantId: member.tenantId,
                        actorId: member.actorId,
                        enabled: !tracked,
                      })
                    }
                    className="px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                  >
                    {tracked ? 'Tracking on' : 'Tracking off'}
                  </button>
                )}
                <select
                  aria-label={`Role for ${name}`}
                  value={member.role}
                  disabled={busy}
                  onChange={(e) =>
                    void run('setMemberRole', {
                      tenantId: member.tenantId,
                      actorId: member.actorId,
                      role: e.target.value,
                    })
                  }
                  className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void run('setMemberStatus', {
                      tenantId: member.tenantId,
                      actorId: member.actorId,
                      status: disabled ? 'active' : 'disabled',
                    })
                  }
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border disabled:opacity-60 ${
                    disabled
                      ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                      : 'border-red-300 text-red-600 hover:bg-red-50'
                  }`}
                >
                  {disabled ? 'Re-enable' : 'Disable'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function People({ data, reload }: { data: AdminData; reload: () => void }) {
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const members = useMemo(
    () =>
      [...data.members]
        .filter((m) => {
          if (needle === '') return true;
          const person = data.people.find((p) => p.actorId === m.actorId);
          return [m.displayName, person?.displayName, person?.email, companyName(data.companies, m.tenantId)].some(
            (field) => (field ?? '').toLowerCase().includes(needle)
          );
        })
        .sort(byNewest),
    [data, needle]
  );

  return (
    <>
      <label className="relative block sm:w-80">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          aria-label="Search people"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name, email or company"
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </label>
      <div className="bg-white rounded-2xl shadow-md border border-gray-100">
        <MemberList members={members} data={data} onChanged={reload} />
      </div>
    </>
  );
}

export function AdminPeople() {
  const { state, reload } = useAdminData();
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">People</h2>
        <p className="text-gray-600 mt-1">
          Everyone signed up, by company. Disabling stops them acting; their name stays on the jobs they did.
        </p>
      </div>
      {state.kind === 'loading' && <p className="text-gray-600">Loading people…</p>}
      {state.kind === 'error' && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {state.message}
        </div>
      )}
      {state.kind === 'ready' && <People data={state.data} reload={reload} />}
    </div>
  );
}
