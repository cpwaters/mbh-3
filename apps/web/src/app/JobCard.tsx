import type { ReactNode } from 'react';
import { MapPin, TriangleAlert } from 'lucide-react';

// Universal job/load card, matching the reference design used across the
// site: white card, sections separated by thin dividers, in the order
// status badge -> addresses -> payment -> details -> actions. Actions stack
// full-width on mobile and sit in a row from sm: up. Ported verbatim from the
// mbh-2 prototype (client/src/components/JobCard.tsx).

const statusColors: Record<string, string> = {
  available: 'bg-green-100 text-green-800',
  accepted: 'bg-blue-100 text-blue-800',
  collected: 'bg-purple-100 text-purple-800',
  in_transit: 'bg-yellow-100 text-yellow-800',
  delivered: 'bg-indigo-100 text-indigo-800',
  closed: 'bg-gray-100 text-gray-800',
  paid: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-red-100 text-red-800',
  fulfilled: 'bg-emerald-100 text-emerald-800',
};

export function JobCard({ children }: { children: ReactNode }) {
  return <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">{children}</div>;
}

export function JobCardStatusBadge({ status }: { status: string }) {
  const color = statusColors[status] || 'bg-gray-100 text-gray-800';
  const label = status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
  return <span className={`px-3 py-1 rounded-full text-sm font-medium ${color}`}>{label}</span>;
}

// Dangerous goods. Only a driver holding an ADR certificate, in a vehicle
// equipped for it, may carry the load, so it is flagged wherever the load is
// shown rather than tucked into the details.
export function AdrPill() {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-orange-800 ring-1 ring-orange-300"
      title="Dangerous goods — needs an ADR-certified driver"
    >
      <TriangleAlert className="w-3.5 h-3.5" aria-hidden="true" />
      ADR
    </span>
  );
}

// Shown in place of a working Accept button on an ADR load the driver can't
// take yet: says why, and where to fix it.
export function AdrAcceptNote({ message, onOpenProfile }: { message: string; onOpenProfile?: () => void }) {
  return (
    <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
      <TriangleAlert className="w-4 h-4 flex-shrink-0 text-orange-600" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {onOpenProfile && (
        <button
          type="button"
          onClick={onOpenProfile}
          className="self-start sm:self-auto rounded-lg border border-orange-300 bg-white px-3 py-1.5 font-medium text-orange-800 hover:bg-orange-100"
        >
          Add ADR certificate
        </button>
      )}
    </div>
  );
}

export function JobCardRoute({
  badge,
  adr = false,
  origin,
  destination,
}: {
  badge?: ReactNode;
  // Dangerous goods: shows the ADR pill beside the badge.
  adr?: boolean;
  origin: string;
  destination: string;
}) {
  return (
    <div>
      {(badge || adr) && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {badge}
          {adr && <AdrPill />}
        </div>
      )}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0" />
          <span className="font-semibold text-gray-900">{origin}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <span className="text-gray-400 w-4 text-center flex-shrink-0">→</span>
          <span className="font-semibold">{destination}</span>
        </div>
      </div>
    </div>
  );
}

export function JobCardPayment({ amount }: { amount: string }) {
  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <div className="text-2xl font-bold text-green-600">{amount}</div>
      <div className="text-sm text-gray-500">Payment</div>
    </div>
  );
}

export function JobCardSection({ children }: { children: ReactNode }) {
  return <div className="mt-4 pt-4 border-t border-gray-100">{children}</div>;
}

export function JobCardActions({ children }: { children: ReactNode }) {
  return <div className="mt-4 pt-4 border-t border-gray-100 flex flex-col sm:flex-row gap-3">{children}</div>;
}
