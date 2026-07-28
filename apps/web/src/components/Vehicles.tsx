import { useState } from 'react';
import { Truck, Plus, Trash2 } from 'lucide-react';
import { genRequestId } from '@mbh/client';
import { VEHICLE_TYPES, VEHICLE_TYPE_LABELS, type VehicleType } from '@mbh/domain';
import { dispatchAction } from '../lib/dispatch';
import { useVehicles } from './useVehicles';

const INPUT =
  'w-full px-3 py-2.5 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

// The carrier's fleet: lists active vehicles and dispatches addVehicle /
// retireVehicle (online, idempotent) — the same request/response path as
// accepting a load.
export function Vehicles({
  carrierTenantId,
  getIdToken,
}: {
  carrierTenantId: string;
  getIdToken: () => Promise<string | null>;
}) {
  const { loading, vehicles, reload } = useVehicles(carrierTenantId);
  const [reg, setReg] = useState('');
  const [type, setType] = useState<VehicleType>('artic');
  const [capacity, setCapacity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const res = await dispatchAction(
        getIdToken,
        'addVehicle',
        { carrierTenantId, registration: reg, type, capacityKg: Math.round(Number(capacity)) },
        genRequestId()
      );
      if (res.ok) {
        setReg('');
        setCapacity('');
        reload();
      } else {
        setError(res.error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function retire(vehicleId: string): Promise<void> {
    setError(null);
    const res = await dispatchAction(getIdToken, 'retireVehicle', { carrierTenantId, vehicleId }, genRequestId());
    if (res.ok) reload();
    else setError(res.error.message);
  }

  return (
    <section className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
      <h2 className="font-bold text-gray-900 mb-3">Your vehicles</h2>
      {error !== null && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : vehicles.length === 0 ? (
        <p className="text-gray-500 mb-4">No vehicles yet. Add your first below.</p>
      ) : (
        <ul className="divide-y divide-gray-100 mb-4">
          {vehicles.map((v) => (
            <li key={v.vehicleId} className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <Truck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{v.registration}</p>
                  <p className="text-sm text-gray-500">
                    {VEHICLE_TYPE_LABELS[v.type]} · {v.capacityKg.toLocaleString('en-GB')} kg
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void retire(v.vehicleId)}
                title="Retire vehicle"
                aria-label={`Retire ${v.registration}`}
                className="text-gray-400 hover:text-red-600 transition-colors p-2"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-gray-100 pt-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label htmlFor="veh-reg" className="block text-sm font-medium text-gray-700 mb-1.5">
              Registration
            </label>
            <input id="veh-reg" value={reg} onChange={(e) => setReg(e.target.value)} placeholder="AB12 CDE" className={INPUT} />
          </div>
          <div>
            <label htmlFor="veh-type" className="block text-sm font-medium text-gray-700 mb-1.5">
              Type
            </label>
            <select id="veh-type" value={type} onChange={(e) => setType(e.target.value as VehicleType)} className={INPUT}>
              {VEHICLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {VEHICLE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="veh-cap" className="block text-sm font-medium text-gray-700 mb-1.5">
              Capacity (kg)
            </label>
            <input
              id="veh-cap"
              type="number"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="26000"
              className={INPUT}
            />
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void add()}
          className="flex items-center justify-center gap-2 w-full bg-blue-600 text-white py-2.5 rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-60 transition-colors"
        >
          <Plus className="w-4 h-4" />
          {busy ? 'Adding…' : 'Add vehicle'}
        </button>
      </div>
    </section>
  );
}
