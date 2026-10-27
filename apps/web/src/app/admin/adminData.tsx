import { useCallback, useEffect, useState } from 'react';
import { genRequestId } from '@mbh/client';
import type { Job, JobStatus, Load, LoadStatus, Member, Role, Tenant } from '@mbh/domain';
import type { AdminPerson } from '@mbh/provider-interfaces';
import { useApp } from '../context';
import { dispatchAction } from '../../lib/dispatch';
import { getReader } from '../../lib/reader';

// Everything the back office lists, read once per screen. The marketplace is
// small enough that the whole of it fits in one read; when it is not, this is
// where paging goes, and the screens keep working off the same shape.
export interface AdminData {
  companies: Tenant[];
  members: Member[];
  people: AdminPerson[];
  loads: Load[];
  jobs: Job[];
}

export type AdminDataState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; data: AdminData };

export function useAdminData(): { state: AdminDataState; reload: () => void } {
  const [state, setState] = useState<AdminDataState>({ kind: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const reader = getReader();
    Promise.all([
      reader.adminCompanies(),
      reader.adminMembers(),
      reader.adminPeople(),
      reader.adminLoads(),
      reader.adminJobs(),
    ])
      .then(([companies, members, people, loads, jobs]) => {
        if (!cancelled) setState({ kind: 'ready', data: { companies, members, people, loads, jobs } });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error', message: 'Could not read the marketplace. Try again.' });
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { state, reload };
}

// A founder control: dispatch, then report. Online-only by nature — these
// are decisions taken at a desk, and a suspension queued offline and applied
// hours later would be worse than one that plainly failed.
export function useAdminAction(onDone: () => void): {
  run: (type: string, payload: Record<string, unknown>) => Promise<boolean>;
  busy: boolean;
  error: string | null;
  clearError: () => void;
} {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(
    async (type: string, payload: Record<string, unknown>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      const res = await dispatchAction(app.auth.getIdToken, type, payload, genRequestId());
      setBusy(false);
      if (!res.ok) {
        setError(res.error.message);
        return false;
      }
      onDone();
      return true;
    },
    [app.auth, onDone]
  );

  return { run, busy, error, clearError: () => setError(null) };
}

export function companyName(companies: readonly Tenant[], tenantId: string): string {
  return companies.find((c) => c.tenantId === tenantId)?.name ?? tenantId;
}

export function personName(data: Pick<AdminData, 'people' | 'members'>, actorId: string): string {
  const person = data.people.find((p) => p.actorId === actorId);
  if (person !== undefined && person.displayName !== '') return person.displayName;
  return data.members.find((m) => m.actorId === actorId)?.displayName ?? actorId;
}

export function formatWhen(iso: string | undefined): string {
  if (iso === undefined || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDay(iso: string | undefined): string {
  if (iso === undefined || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const byNewest = <T extends { createdAt?: string }>(a: T, b: T): number =>
  (b.createdAt ?? '').localeCompare(a.createdAt ?? '');

// The trade's words for each state, not the database's.
export const LOAD_STATUS_LABELS: Record<LoadStatus, string> = {
  available: 'On offer',
  matched: 'Taken',
  cancelled: 'Cancelled',
  fulfilled: 'Delivered',
};

export const LOAD_STATUS_STYLES: Record<LoadStatus, string> = {
  available: 'bg-emerald-100 text-emerald-800',
  matched: 'bg-blue-100 text-blue-800',
  cancelled: 'bg-gray-100 text-gray-600',
  fulfilled: 'bg-indigo-100 text-indigo-800',
};

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  accepted: 'Accepted',
  collected: 'Collected',
  in_transit: 'On the road',
  delivered: 'Delivered',
  closed: 'Closed',
};

export const JOB_STATUS_STYLES: Record<JobStatus, string> = {
  accepted: 'bg-amber-100 text-amber-800',
  collected: 'bg-blue-100 text-blue-800',
  in_transit: 'bg-blue-100 text-blue-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-gray-100 text-gray-600',
};

export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  dispatcher: 'Dispatcher',
  driver: 'Driver',
};

export function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded ${className}`}>{children}</span>;
}
