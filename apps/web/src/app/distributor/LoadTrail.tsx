import { MapPin, RefreshCw } from 'lucide-react';
import type { JobTrail } from '@mbh/provider-interfaces';

// How old a fix has to be before the wording changes from "moving" to
// something more careful. A breadcrumb lands roughly once a mile, so at
// motorway speed that is about a minute; twenty minutes of nothing means
// stopped, out of signal, or the app closed — and we cannot tell which.
const STALE_MS = 20 * 60 * 1000;

export function lastSeenLabel(lastSeenAt: string | null, now: number): string {
  if (lastSeenAt === null) return 'No position recorded yet';
  const ageMs = now - Date.parse(lastSeenAt);
  if (Number.isNaN(ageMs)) return 'No position recorded yet';
  if (ageMs < 60_000) return 'Last seen just now';

  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 60) return `Last seen ${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Last seen ${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `Last seen ${days} day${days === 1 ? '' : 's'} ago`;
}

export function isStale(lastSeenAt: string | null, now: number): boolean {
  if (lastSeenAt === null) return true;
  const ageMs = now - Date.parse(lastSeenAt);
  return Number.isNaN(ageMs) || ageMs > STALE_MS;
}

// The line under the map. Deliberately never says "live": the app only
// reports a position while the driver has it open and in the foreground, so
// the most recent breadcrumb can be perfectly true and half an hour old.
// Dressing that up as a live position is the one thing worth not doing — a
// shipper reading a stale dot as current makes a promise to THEIR customer
// on the strength of it.
export function TrailStatus({
  trail,
  loading,
  error,
  now,
  onRefresh,
}: {
  trail: JobTrail | null;
  loading: boolean;
  error: string | null;
  now: number;
  onRefresh: () => void;
}) {
  if (loading && trail === null) {
    return <p className="text-sm text-gray-500">Looking for this load…</p>;
  }

  if (trail === null) {
    return <p className="text-sm text-gray-500">No carrier has accepted this load yet.</p>;
  }

  const stale = isStale(trail.lastSeenAt, now);
  const none = trail.points.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className={`inline-flex items-center gap-1.5 text-sm ${stale ? 'text-amber-700' : 'text-green-700'}`}>
        <MapPin className="w-4 h-4" />
        {lastSeenLabel(trail.lastSeenAt, now)}
      </span>

      {none && (
        <span className="text-sm text-gray-500">
          The driver has not sent a position yet — tracking starts once they collect.
        </span>
      )}

      {stale && !none && (
        <span className="text-sm text-gray-500">
          This is where the load was, not necessarily where it is now.
        </span>
      )}

      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        Refresh
      </button>

      {error !== null && <span className="text-sm text-amber-700">{error}</span>}
    </div>
  );
}
