import { useState } from 'react';
import { genRequestId } from '@mbh/client';
import { dispatchAction } from '../lib/dispatch';

// The shipper's post-a-load form. Dispatches postLoad (online, idempotent).
// The server owns validation; its structured message is shown on failure.
export function PostLoad({
  shipperTenantId,
  getIdToken,
}: {
  shipperTenantId: string;
  getIdToken: () => Promise<string | null>;
}) {
  const empty = {
    originLine1: '',
    originTown: '',
    originPostcode: '',
    destLine1: '',
    destTown: '',
    destPostcode: '',
    description: '',
    weightKg: '',
    palletCount: '',
    priceGbp: '',
    pickupBy: '',
    deliverBy: '',
  };
  const [f, setF] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState(false);

  const set = (k: keyof typeof empty) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  async function submit(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const payload = {
        shipperTenantId,
        origin: { line1: f.originLine1, town: f.originTown, postcode: f.originPostcode },
        destination: { line1: f.destLine1, town: f.destTown, postcode: f.destPostcode },
        consignment: {
          description: f.description,
          weightKg: Number(f.weightKg),
          palletCount: Number(f.palletCount),
        },
        priceGbpPence: Math.round(Number(f.priceGbp) * 100),
        pickupBy: f.pickupBy,
        deliverBy: f.deliverBy,
      };
      const res = await dispatchAction(getIdToken, 'postLoad', payload, genRequestId());
      if (res.ok) {
        setPosted(true);
        setF(empty);
      } else {
        setError(res.error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (posted) {
    return (
      <div className="card">
        <h2>Load posted</h2>
        <p className="muted">Carriers can see it now. It will be routed automatically.</p>
        <button type="button" className="primary" onClick={() => setPosted(false)}>
          Post another load
        </button>
      </div>
    );
  }

  const field = (label: string, key: keyof typeof empty, type = 'text', placeholder = '') => (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={f[key]} onChange={set(key)} placeholder={placeholder} />
    </label>
  );

  return (
    <section className="card">
      <h2>Post a load</h2>
      {error !== null && <p style={{ color: '#dc2626' }}>{error}</p>}

      {field('Collection address', 'originLine1', 'text', '10 Distribution Way')}
      {field('Collection town', 'originTown', 'text', 'Trafford')}
      {field('Collection postcode', 'originPostcode', 'text', 'M17 1WS')}

      {field('Delivery address', 'destLine1', 'text', '5 Harbour Road')}
      {field('Delivery town', 'destTown', 'text', 'Leith')}
      {field('Delivery postcode', 'destPostcode', 'text', 'EH6 6JJ')}

      {field('Description', 'description', 'text', 'Mixed pallets')}
      {field('Weight (kg)', 'weightKg', 'number', '14200')}
      {field('Pallets', 'palletCount', 'number', '16')}
      {field('Price (£)', 'priceGbp', 'number', '680')}
      {field('Collect by', 'pickupBy', 'date')}
      {field('Deliver by', 'deliverBy', 'date')}

      <button type="button" className="primary" disabled={busy} onClick={() => void submit()}>
        {busy ? 'Posting…' : 'Post load'}
      </button>
    </section>
  );
}
