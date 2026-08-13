import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Truck, FileText, ArrowLeft, Plus } from 'lucide-react';
import { genRequestId } from '@mbh/client';
import {
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  VEHICLE_CONFIGURATIONS,
  VEHICLE_CONFIGURATION_LABELS,
  vehicleNeedsConfiguration,
  vehicleNeedsRegistrationDetails,
  vehicleNeedsTrailerNumber,
} from '@mbh/domain';
import { useApp } from './context';
import { dispatchAction } from '../lib/dispatch';

const INPUT = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent';

// Ported from the mbh-2 prototype (client/src/pages/AddVehicle.tsx). Wired to
// mbh-3's addVehicle dispatch against the selected carrier tenant's fleet.
export default function AddVehicle() {
  const app = useApp();
  const navigate = useNavigate();
  // Go back where the driver or shipper came from: the carrier's fleet lives
  // on Profile, a shipper's on its own Fleet screen.
  const returnTo = (useLocation().state as { from?: string } | null)?.from ?? '/profile';
  const returnLabel = returnTo === '/vehicles' ? 'Back to Fleet' : 'Back to Profile';
  // A fleet belongs to a company, not to a side of the marketplace — a
  // shipper running its own vehicles manages them here too.
  const fleetTenantId = app.selected?.tenantId ?? null;

  const [f, setF] = useState({
    make: '',
    model: '',
    year: '',
    vin: '',
    registration: '',
    trailerNumber: '',
    vehicleType: '',
    vehicleConfiguration: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((prev) => ({ ...prev, [k]: e.target.value }));

  // Which fields this type actually needs — the same domain rule the server
  // enforces, so the form can never offer something the action will reject.
  const needsDetails = vehicleNeedsRegistrationDetails(f.vehicleType);
  const needsConfiguration = vehicleNeedsConfiguration(f.vehicleType);
  const needsTrailerNumber = vehicleNeedsTrailerNumber(f.vehicleType);

  // Switching type clears what the new type does not use, so a rigid changed
  // to a trailer cannot quietly submit the make/plate typed a moment ago.
  const setVehicleType = (e: { target: { value: string } }) => {
    const vehicleType = e.target.value;
    setF((prev) => ({
      ...prev,
      vehicleType,
      ...(vehicleNeedsRegistrationDetails(vehicleType) ? {} : { make: '', model: '', year: '', registration: '', vin: '' }),
      ...(vehicleNeedsConfiguration(vehicleType) ? {} : { vehicleConfiguration: '' }),
      ...(vehicleNeedsTrailerNumber(vehicleType) ? {} : { trailerNumber: '' }),
    }));
  };

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (fleetTenantId === null) {
      setError('Select a company before adding a vehicle.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await dispatchAction(
        app.auth.getIdToken,
        'addVehicle',
        {
          carrierTenantId: fleetTenantId,
          registration: f.registration,
          make: f.make,
          model: f.model,
          year: parseInt(f.year, 10) || 0,
          trailerNumber: f.trailerNumber,
          vin: f.vin,
          vehicleType: f.vehicleType,
          vehicleConfiguration: f.vehicleConfiguration,
        },
        genRequestId()
      );
      if (res.ok) {
        navigate(returnTo);
      } else {
        setError(res.error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <button onClick={() => navigate(returnTo)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-4 h-4" />
          {returnLabel}
        </button>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Add Vehicle</h1>
        <p className="text-gray-600">Register a new vehicle to your fleet</p>
      </div>

      {error && <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

      <form onSubmit={submit} className="space-y-6">
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Vehicle Type</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="vehicleType" className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle Type *
              </label>
              <select id="vehicleType" value={f.vehicleType} onChange={setVehicleType} required className={INPUT}>
                <option value="">Select type...</option>
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {VEHICLE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            {needsTrailerNumber && (
              <div>
                <label htmlFor="trailerNumber" className="block text-sm font-medium text-gray-700 mb-1">
                  Trailer Number *
                </label>
                <input
                  id="trailerNumber"
                  value={f.trailerNumber}
                  onChange={set('trailerNumber')}
                  required
                  placeholder="e.g., TR-114"
                  className={INPUT}
                />
                <p className="mt-1 text-xs text-gray-500">
                  The fleet number on the trailer — it carries no plate of its own.
                </p>
              </div>
            )}
            {needsConfiguration && (
              <div>
                <label htmlFor="vehicleConfiguration" className="block text-sm font-medium text-gray-700 mb-1">
                  Vehicle Configuration *
                </label>
                <select id="vehicleConfiguration" value={f.vehicleConfiguration} onChange={set('vehicleConfiguration')} required className={INPUT}>
                  <option value="">Select configuration...</option>
                  {VEHICLE_CONFIGURATIONS.map((c) => (
                    <option key={c} value={c}>
                      {VEHICLE_CONFIGURATION_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {needsDetails && (
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <Truck className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-semibold text-gray-900">Vehicle Details</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="make" className="block text-sm font-medium text-gray-700 mb-1">
                  Make *
                </label>
                <input id="make" value={f.make} onChange={set('make')} required placeholder="e.g., Mercedes-Benz, Volvo, Scania" className={INPUT} />
              </div>
              <div>
                <label htmlFor="model" className="block text-sm font-medium text-gray-700 mb-1">
                  Model *
                </label>
                <input id="model" value={f.model} onChange={set('model')} required placeholder="e.g., Actros 2545, FH16" className={INPUT} />
              </div>
              <div>
                <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-1">
                  Year *
                </label>
                <input
                  id="year"
                  type="number"
                  value={f.year}
                  onChange={set('year')}
                  required
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  placeholder="e.g., 2020"
                  className={INPUT}
                />
              </div>
              <div>
                <label htmlFor="registration" className="block text-sm font-medium text-gray-700 mb-1">
                  Registration Number *
                </label>
                <input id="registration" value={f.registration} onChange={set('registration')} required placeholder="e.g., AB12 CDE" className={INPUT} />
              </div>
              <div className="md:col-span-2">
                <label htmlFor="vin" className="block text-sm font-medium text-gray-700 mb-1">
                  VIN (Vehicle Identification Number)
                </label>
                <input id="vin" value={f.vin} onChange={set('vin')} placeholder="17-character VIN" maxLength={17} className={INPUT} />
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {saving ? (
              <>Adding Vehicle...</>
            ) : (
              <>
                <Plus className="w-5 h-5" />
                Add Vehicle
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate(returnTo)}
            className="px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
