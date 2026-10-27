import { useEffect, useState } from 'react';
import type { AdminActivity as Activity } from '@mbh/provider-interfaces';
import { getReader } from '../../lib/reader';
import { companyName, formatWhen, personName, useAdminData, type AdminData } from './adminData';

const ACTIVITY_LIMIT = 200;

// What each action is, in words. Anything unlisted falls back to its name, so
// a new action shows up here on day one rather than being hidden.
export const ACTION_LABELS: Record<string, string> = {
  postLoad: 'Posted a load',
  acceptLoad: 'Accepted a load',
  cancelLoad: 'Cancelled a load',
  collectJob: 'Collected',
  startTransit: 'Set off',
  deliverJob: 'Delivered (PoD)',
  relistJob: 'Put a load back on offer',
  addVehicle: 'Added a vehicle',
  retireVehicle: 'Retired a vehicle',
  updateProfile: 'Updated their profile',
  createTenant: 'Set up a company',
  createInvite: 'Created an invitation',
  revokeInvite: 'Withdrew an invitation',
  recordRoutePoint: 'Location update',
  recordMotion: 'Stopped / moving',
  setJobTracking: 'Paused / resumed tracking',
  sendTestInvoiceEmail: 'Sent a test invoice',
  backfillCloseJobs: 'Closed old jobs',
  saveAddressBookEntry: 'Saved an address',
  updateAddressBookEntry: 'Edited an address',
  archiveAddressBookEntry: 'Archived an address',
  setCompanyLogo: 'Set the company logo',
  clearCompanyLogo: 'Removed the company logo',
  suspendCompany: 'Suspended a company',
  reinstateCompany: 'Reinstated a company',
  setMemberStatus: 'Changed someone’s access',
  setMemberRole: 'Changed someone’s role',
};

// Location breadcrumbs are most of the log by volume and say little on their
// own, so they are off by default.
const NOISY = new Set(['recordRoutePoint', 'recordMotion']);

function summary(entry: Activity, data: AdminData): string {
  const d = entry.detail;
  const parts: string[] = [];
  const tenantId = d.tenantId ?? d.shipperTenantId ?? d.carrierTenantId;
  if (typeof d.companyName === 'string') parts.push(d.companyName);
  else if (typeof tenantId === 'string') parts.push(companyName(data.companies, tenantId));
  if (typeof d.displayName === 'string') parts.push(d.displayName);
  if (typeof d.from === 'string' && typeof d.to === 'string') parts.push(`${d.from} → ${d.to}`);
  if (typeof d.reason === 'string') parts.push(`“${d.reason}”`);
  if (typeof d.note === 'string' && d.note !== '') parts.push(`“${d.note}”`);
  return parts.join(' · ');
}

function Feed({ entries, data }: { entries: Activity[]; data: AdminData }) {
  const [showNoisy, setShowNoisy] = useState(false);
  const shown = showNoisy ? entries : entries.filter((e) => !NOISY.has(e.action));
  return (
    <>
      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={showNoisy} onChange={(e) => setShowNoisy(e.target.checked)} />
        Include location updates
      </label>
      {shown.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-10 text-center text-gray-600">
          Nothing yet.
        </div>
      ) : (
        <ul className="bg-white rounded-2xl shadow-md border border-gray-100 divide-y divide-gray-100">
          {shown.map((entry) => (
            <li key={entry.auditId} className="p-4 flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4">
              <span className="text-xs text-gray-500 sm:w-40 shrink-0">{formatWhen(entry.at)}</span>
              <div className="min-w-0">
                <span className="font-medium text-gray-900">{personName(data, entry.actorId)}</span>{' '}
                <span className="text-gray-700">{(ACTION_LABELS[entry.action] ?? entry.action).toLowerCase()}</span>
                {entry.source === 'system' && <span className="text-xs text-gray-500"> (system)</span>}
                {summary(entry, data) !== '' && <p className="text-sm text-gray-500">{summary(entry, data)}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function AdminActivity() {
  const { state } = useAdminData();
  const [entries, setEntries] = useState<Activity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getReader()
      .adminActivity(ACTIVITY_LIMIT)
      .then((rows) => {
        if (!cancelled) setEntries(rows);
      })
      .catch(() => {
        if (!cancelled) setError('Could not read the activity log.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const failed = error ?? (state.kind === 'error' ? state.message : null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Activity</h2>
        <p className="text-gray-600 mt-1">
          The last {ACTIVITY_LIMIT} things anyone did, newest first — straight from the audit log every action
          writes.
        </p>
      </div>
      {failed !== null && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">
          {failed}
        </div>
      )}
      {failed === null && (entries === null || state.kind !== 'ready') && <p className="text-gray-600">Loading activity…</p>}
      {failed === null && entries !== null && state.kind === 'ready' && <Feed entries={entries} data={state.data} />}
    </div>
  );
}
