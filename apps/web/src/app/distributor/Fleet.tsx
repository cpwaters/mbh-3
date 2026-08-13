import { useNavigate } from 'react-router-dom';
import { Truck, Plus, Calendar, Container } from 'lucide-react';
import {
  VEHICLE_TYPE_LABELS,
  VEHICLE_CONFIGURATION_LABELS,
  type Vehicle,
  type VehicleType,
  type VehicleConfiguration,
} from '@mbh/domain';
import { genRequestId } from '@mbh/client';
import { useApp } from '../context';
import { useVehicles } from '../../components/useVehicles';
import { dispatchAction } from '../../lib/dispatch';

// A shipper's own fleet. Plenty of shippers run their own vehicles and
// trailers alongside the loads they put out to carriers, so a fleet belongs to
// a company rather than to one side of the marketplace — the same addVehicle /
// retireVehicle actions back both. Retired, never deleted.
export default function Fleet() {
  const app = useApp();
  const navigate = useNavigate();
  const tenantId = app.selected?.tenantId ?? null;
  const { loading, vehicles, reload } = useVehicles(tenantId);

  async function retire(vehicleId: string): Promise<void> {
    if (tenantId === null) return;
    const res = await dispatchAction(
      app.auth.getIdToken,
      'retireVehicle',
      { carrierTenantId: tenantId, vehicleId },
      genRequestId()
    );
    if (res.ok) reload();
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <div className="flex items-center justify-center h-64 text-gray-600">Loading fleet…</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Fleet</h1>
          <p className="text-gray-600">Your own vehicles and trailers</p>
        </div>
        <button
          onClick={() => navigate('/vehicles/add', { state: { from: '/vehicles' } })}
          className="shrink-0 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add vehicle
        </button>
      </div>

      {vehicles.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vehicles.map((vehicle) => (
            <FleetCard key={vehicle.vehicleId} vehicle={vehicle} onRetire={() => void retire(vehicle.vehicleId)} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <Truck className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No vehicles yet</h3>
          <p className="text-gray-600">Add the vehicles and trailers you run yourself.</p>
        </div>
      )}
    </div>
  );
}

function FleetCard({ vehicle, onRetire }: { vehicle: Vehicle; onRetire: () => void }) {
  const typeLabel = VEHICLE_TYPE_LABELS[vehicle.vehicleType as VehicleType];
  const configLabel =
    vehicle.vehicleConfiguration !== ''
      ? VEHICLE_CONFIGURATION_LABELS[vehicle.vehicleConfiguration as VehicleConfiguration]
      : '';
  // A trailer carries no make/model — it is known by its number, so that is
  // what heads its card.
  const heading =
    `${vehicle.make} ${vehicle.model}`.trim() ||
    vehicle.trailerNumber ||
    [typeLabel, configLabel].filter(Boolean).join(' — ');

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200 p-5">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {vehicle.trailerNumber !== '' ? (
            <Container className="w-5 h-5 text-blue-600 shrink-0" />
          ) : (
            <Truck className="w-5 h-5 text-blue-600 shrink-0" />
          )}
          <h4 className="font-semibold text-gray-900 truncate">{heading}</h4>
        </div>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded shrink-0">{typeLabel}</span>
      </div>

      {/* Each row appears only when that type carries the field: a trailer has
          no plate or year, a unit has no configuration of its own. */}
      <div className="space-y-2 text-sm">
        {vehicle.trailerNumber !== '' && (
          <div className="flex justify-between">
            <span className="text-gray-600">Trailer number:</span>
            <span className="font-medium text-gray-900">{vehicle.trailerNumber}</span>
          </div>
        )}
        {vehicle.registration !== '' && (
          <div className="flex justify-between">
            <span className="text-gray-600">Registration:</span>
            <span className="font-medium text-gray-900">{vehicle.registration}</span>
          </div>
        )}
        {vehicle.year > 0 && (
          <div className="flex justify-between">
            <span className="text-gray-600">Year:</span>
            <span className="font-medium text-gray-900 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {vehicle.year}
            </span>
          </div>
        )}
        {configLabel !== '' && (
          <div className="flex justify-between">
            <span className="text-gray-600">Configuration:</span>
            <span className="font-medium text-gray-900">{configLabel}</span>
          </div>
        )}
        {vehicle.vin !== '' && (
          <div className="flex justify-between">
            <span className="text-gray-600">VIN:</span>
            <span className="font-medium text-gray-900 text-xs">{vehicle.vin}</span>
          </div>
        )}
      </div>

      <button
        onClick={onRetire}
        className="mt-3 text-xs text-gray-400 hover:text-red-600 transition-colors"
        title="Retire this vehicle — the record is kept"
      >
        Remove
      </button>
    </div>
  );
}
