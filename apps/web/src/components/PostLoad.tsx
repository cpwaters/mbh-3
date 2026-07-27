import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { genRequestId } from '@mbh/client';
import { dispatchAction } from '../lib/dispatch';

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
type Form = typeof empty;

const INPUT =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';
const SECTION = 'text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2';

// The shipper's post-a-load form. Dispatches postLoad (online, idempotent).
export function PostLoad({
  shipperTenantId,
  getIdToken,
}: {
  shipperTenantId: string;
  getIdToken: () => Promise<string | null>;
}) {
  const [f, setF] = useState<Form>(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState(false);

  const set = (k: keyof Form) => (e: { target: { value: string } }) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  function field(label: string, key: keyof Form, type = 'text', placeholder = '') {
    return (
      <div>
        <label htmlFor={key} className="block text-sm font-medium text-gray-700 mb-1.5">
          {label}
        </label>
        <input id={key} type={type} value={f[key]} onChange={set(key)} placeholder={placeholder} className={INPUT} />
      </div>
    );
  }

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
      <div className="bg-white rounded-xl shadow-md border border-green-200 p-6 text-center">
        <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-2" />
        <h2 className="text-xl font-bold text-gray-900 mb-1">Load posted</h2>
        <p className="text-gray-600 mb-4">Carriers can see it now. It will be routed automatically.</p>
        <button
          type="button"
          onClick={() => setPosted(false)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
        >
          Post another load
        </button>
      </div>
    );
  }

  return (
    <section className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Post a load</h2>
      {error !== null && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="space-y-5">
        <div>
          <p className={SECTION}>Collection</p>
          <div className="space-y-3">
            {field('Collection address', 'originLine1', 'text', '10 Distribution Way')}
            <div className="grid grid-cols-2 gap-3">
              {field('Collection town', 'originTown', 'text', 'Trafford')}
              {field('Collection postcode', 'originPostcode', 'text', 'M17 1WS')}
            </div>
          </div>
        </div>

        <div>
          <p className={SECTION}>Delivery</p>
          <div className="space-y-3">
            {field('Delivery address', 'destLine1', 'text', '5 Harbour Road')}
            <div className="grid grid-cols-2 gap-3">
              {field('Delivery town', 'destTown', 'text', 'Leith')}
              {field('Delivery postcode', 'destPostcode', 'text', 'EH6 6JJ')}
            </div>
          </div>
        </div>

        <div>
          <p className={SECTION}>Load details</p>
          <div className="space-y-3">
            {field('Description', 'description', 'text', 'Mixed pallets')}
            <div className="grid grid-cols-2 gap-3">
              {field('Weight (kg)', 'weightKg', 'number', '14200')}
              {field('Pallets', 'palletCount', 'number', '16')}
            </div>
            {field('Price (£)', 'priceGbp', 'number', '680')}
            <div className="grid grid-cols-2 gap-3">
              {field('Collect by', 'pickupBy', 'date')}
              {field('Deliver by', 'deliverBy', 'date')}
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          {busy ? 'Posting…' : 'Post load'}
        </button>
      </div>
    </section>
  );
}
