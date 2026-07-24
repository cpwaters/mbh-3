import { useState } from 'react';
import { formatGbp, type Listing } from '@mbh/domain';
import { genRequestId } from '@mbh/client';
import { dispatchAction } from '../lib/dispatch';

// The carrier browse: available loads with an Accept action. Accepting is an
// online request/response (the carrier needs to know if they got it), not an
// offline capture. On success the parent re-reads the active job.
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
        onChanged(); // the load may be gone — refresh the list
      }
    } finally {
      setBusyLoadId(null);
    }
  }

  if (listings.length === 0) {
    return (
      <div className="card">
        <h2>No loads available</h2>
        <p className="muted">New backhauls will appear here as shippers post them.</p>
      </div>
    );
  }

  return (
    <section className="card">
      <h2>Available loads</h2>
      {error !== null && <p style={{ color: '#dc2626' }}>{error}</p>}
      <ul className="queue">
        {listings.map((l) => (
          <li key={l.loadId} style={{ display: 'block' }}>
            <strong>
              {l.origin.town} → {l.destination.town}
            </strong>
            <div className="muted small">
              {l.origin.postcode} → {l.destination.postcode} · {l.palletCount} pallets ·{' '}
              {formatGbp(l.priceGbpPence)}
              {l.route !== undefined ? ` · ${Math.round(l.route.distanceMeters / 1000)} km` : ''}
            </div>
            <button
              type="button"
              className="primary"
              disabled={busyLoadId !== null}
              onClick={() => void accept(l.loadId)}
              style={{ marginTop: 6 }}
            >
              {busyLoadId === l.loadId ? 'Accepting…' : 'Accept load'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
