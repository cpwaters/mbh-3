import { useEffect, useState } from 'react';
import { Package, Weight, Box, Clock, Navigation, XCircle } from 'lucide-react';
import { formatGbp } from '@mbh/domain';
import { genRequestId } from '@mbh/client';
import type { ShipperLoad } from '@mbh/provider-interfaces';
import { useApp } from '../context';
import { useShipperLoads } from '../../components/useShipperLoads';
import { dispatchAction } from '../../lib/dispatch';
import LiveLocationMap from '../LiveLocationMap';
import { extractPostcode, geocodePostcode, type GeoPoint } from '../../lib/geocode';
import { getDrivingRoute } from '../../lib/routing';
import {
  JobCard,
  JobCardRoute,
  JobCardPayment,
  JobCardSection,
  JobCardActions,
  JobCardStatusBadge,
} from '../JobCard';

const TRACKABLE_STATUSES = ['matched', 'accepted', 'collected', 'in_transit'];

// A small map for one load: geocodes its origin/destination strings and draws
// the road-following route. (mbh-3 has no server-side live GPS, so no driver
// marker — the route is what we can show honestly.)
function LoadRouteMap({ origin, destination }: { origin: string; destination: string }) {
  const [originPin, setOriginPin] = useState<GeoPoint | null>(null);
  const [destinationPin, setDestinationPin] = useState<GeoPoint | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<GeoPoint[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([geocodePostcode(extractPostcode(origin)), geocodePostcode(extractPostcode(destination))]).then(
      ([o, d]) => {
        if (cancelled) return;
        setOriginPin(o);
        setDestinationPin(d);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [origin, destination]);

  useEffect(() => {
    if (!originPin || !destinationPin) {
      setRouteGeometry(null);
      return;
    }
    let cancelled = false;
    getDrivingRoute(originPin, destinationPin).then((r) => {
      if (!cancelled) setRouteGeometry(r);
    });
    return () => {
      cancelled = true;
    };
  }, [originPin, destinationPin]);

  return (
    <div className="h-72 rounded-lg overflow-hidden border border-gray-200">
      {originPin || destinationPin ? (
        <LiveLocationMap
          origin={originPin ? { ...originPin, label: origin } : undefined}
          destination={destinationPin ? { ...destinationPin, label: destination } : undefined}
          routeGeometry={routeGeometry ?? undefined}
        />
      ) : (
        <div className="h-full flex items-center justify-center bg-gray-50 text-gray-500 text-sm">Loading route...</div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, tint, text }: { label: string; value: number; tint: string; text: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">{label}</p>
          <p className={`text-2xl font-bold ${text}`}>{value}</p>
        </div>
        <div className={`${tint} p-3 rounded-lg`}>
          <Package className={`w-6 h-6 ${text}`} />
        </div>
      </div>
    </div>
  );
}

// Ported from the mbh-2 distributor prototype (distributor/src/pages/
// LoadsList.tsx). Wired to mbh-3's loadsForShipper + the cancelLoad dispatch.
export default function LoadsList() {
  const app = useApp();
  const shipperTenantId = app.selected?.tenantId ?? null;
  const { loading, loads, reload } = useShipperLoads(shipperTenantId);
  const [trackedLoadId, setTrackedLoadId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCancel(load: ShipperLoad): Promise<void> {
    if (load.status !== 'available' || shipperTenantId === null) return;
    setCancellingId(load.loadId);
    setError(null);
    const res = await dispatchAction(
      app.auth.getIdToken,
      'cancelLoad',
      { shipperTenantId, loadId: load.loadId },
      genRequestId()
    );
    if (res.ok) reload();
    else setError(res.error.message);
    setCancellingId(null);
  }

  const count = (status: string) => loads.filter((l) => l.status === status).length;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-600">Loading loads...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">All Loads</h1>
        <p className="text-gray-600">Manage and monitor all created loads</p>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <SummaryCard label="Available" value={count('available')} tint="bg-green-100" text="text-green-600" />
        <SummaryCard label="Matched" value={count('matched')} tint="bg-blue-100" text="text-blue-600" />
        <SummaryCard label="Cancelled" value={count('cancelled')} tint="bg-yellow-100" text="text-yellow-600" />
        <SummaryCard label="Total Loads" value={loads.length} tint="bg-gray-100" text="text-gray-900" />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {loads.map((load) => (
          <JobCard key={load.loadId}>
            <JobCardRoute badge={<JobCardStatusBadge status={load.status} />} origin={load.origin} destination={load.destination} />
            <JobCardPayment amount={formatGbp(load.priceGbpPence)} />
            <JobCardSection>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <div className="text-xs text-gray-500">Distance</div>
                  <div className="font-medium text-gray-900">{load.distanceMiles} miles</div>
                </div>
                <div className="flex items-center gap-2">
                  <Weight className="w-4 h-4 text-gray-500" />
                  <div>
                    <div className="text-xs text-gray-500">Weight</div>
                    <div className="font-medium text-gray-900">{load.weightKg.toLocaleString()} kg</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Box className="w-4 h-4 text-gray-500" />
                  <div>
                    <div className="text-xs text-gray-500">Pallets</div>
                    <div className="font-medium text-gray-900">{load.palletCount}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Pickup</div>
                  <div className="font-medium text-gray-900">{load.pickupBy}</div>
                  <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {load.pickupTime}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Delivery</div>
                  <div className="font-medium text-gray-900">{load.deliverBy}</div>
                  <div className="text-xs text-gray-600 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {load.deliveryTime}
                  </div>
                </div>
              </div>
            </JobCardSection>

            <JobCardActions>
              {TRACKABLE_STATUSES.includes(load.status) && (
                <button
                  onClick={() => setTrackedLoadId((prev) => (prev === load.loadId ? null : load.loadId))}
                  className="w-full sm:flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Navigation className="w-4 h-4" />
                  {trackedLoadId === load.loadId ? 'Hide Route' : 'View Route'}
                </button>
              )}
              <button
                onClick={() => void handleCancel(load)}
                disabled={load.status !== 'available' || cancellingId === load.loadId}
                className="w-full sm:w-auto px-4 py-2 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent flex items-center justify-center gap-2"
                title={load.status === 'available' ? 'Cancel load' : 'Only available loads can be cancelled'}
              >
                <XCircle className="w-4 h-4" />
                {cancellingId === load.loadId ? 'Cancelling...' : 'Cancel Load'}
              </button>
            </JobCardActions>

            {trackedLoadId === load.loadId && (
              <JobCardSection>
                <LoadRouteMap origin={load.origin} destination={load.destination} />
              </JobCardSection>
            )}
          </JobCard>
        ))}
      </div>

      {loads.length === 0 && (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No loads created yet</h3>
          <p className="text-gray-600">Create your first load to get started</p>
        </div>
      )}
    </div>
  );
}
