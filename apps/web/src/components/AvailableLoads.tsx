import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { formatGbp, type Listing } from '@mbh/domain';
import { genRequestId } from '@mbh/client';
import { dispatchAction } from '../lib/dispatch';

// The carrier browse: available loads as cards (prototype JobCard style —
// route with a pin, green payment, an Accept action). Accepting is an online
// request/response; on success the parent re-reads the active job.
export function AvailableLoads({
  carrierTenantId,
  listings,
  getIdToken,
  onAccepted,
  onChanged,
}: {
  carrierTenantId: string | null;
  listings: Listing[];
  getIdToken: () => Promise<string | null>;
  onAccepted: () => void;
  onChanged: () => void;
}) {
  const [busyLoadId, setBusyLoadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function accept(loadId: string): Promise<void> {
    if (carrierTenantId === null) {
      setError('Your carrier account is still loading — try again in a moment.');
      return;
    }
    setError(null);
    setBusyLoadId(loadId);
    try {
      const res = await dispatchAction(
        getIdToken,
        'acceptLoad',
        { carrierTenantId, loadId },
        genRequestId()
      );
      if (res.ok) {
        onAccepted();
      } else {
        setError(res.error.message);
        onChanged();
      }
    } finally {
      setBusyLoadId(null);
    }
  }

  if (listings.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-8 text-center">
        <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center mx-auto mb-3">
          <MapPin className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">No loads available</h2>
        <p className="text-gray-500">New backhauls will appear here as shippers post them.</p>
      </div>
    );
  }

  return (
    <section>
      <h2 className="text-xl font-bold text-gray-900 mb-3">Available loads</h2>
      {error !== null && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {listings.map((l) => (
          <li
            key={l.loadId}
            className="bg-white rounded-xl shadow-md border border-gray-200 p-5 flex flex-col"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="font-semibold text-gray-900">
                  {l.origin.town} → {l.destination.town}
                </span>
              </div>
              <span className="flex-none text-lg font-bold text-green-600">
                {formatGbp(l.priceGbpPence)}
              </span>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              {l.origin.postcode} → {l.destination.postcode} · {l.palletCount} pallets
              {l.route !== undefined ? ` · ${Math.round(l.route.distanceMeters / 1000)} km` : ''}
            </p>
            <button
              type="button"
              disabled={busyLoadId !== null}
              onClick={() => void accept(l.loadId)}
              className="mt-auto w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {busyLoadId === l.loadId ? 'Accepting…' : 'Accept load'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
