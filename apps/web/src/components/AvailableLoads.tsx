import { useState } from 'react';
import { Package, Weight, Box, AlertCircle, Navigation, MapPin } from 'lucide-react';
import { formatGbp, type Listing } from '@mbh/domain';
import { genRequestId } from '@mbh/client';
import { dispatchAction } from '../lib/dispatch';
import type { GeoPoint } from '../lib/geocode';
import { useNearbyListings } from './useNearbyListings';
import {
  JobCard,
  JobCardRoute,
  JobCardPayment,
  JobCardSection,
  JobCardActions,
  JobCardStatusBadge,
} from '../app/JobCard';

// The carrier browse ("Available Loads"), ported from the mbh-2 prototype
// (client/src/pages/Dashboard.tsx): expandable JobCards with Accept / View
// Details. Wired to mbh-3's listings + the acceptLoad dispatch (an online
// request/response; on success the parent re-reads the active job).
export function AvailableLoads({
  carrierTenantId,
  listings,
  getIdToken,
  onAccepted,
  onChanged,
  hasActiveJob,
  driverLocation = null,
  tracking = false,
  onEnableLocation,
}: {
  carrierTenantId: string | null;
  listings: Listing[];
  getIdToken: () => Promise<string | null>;
  onAccepted: () => void;
  onChanged: () => void;
  hasActiveJob: boolean;
  // Live driver position — sorts loads by nearest pickup when present.
  driverLocation?: GeoPoint | null;
  tracking?: boolean;
  onEnableLocation?: () => void;
}) {
  const [expandedLoadId, setExpandedLoadId] = useState<string | null>(null);
  const [acceptingLoadId, setAcceptingLoadId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Rank the browse by proximity to the driver; re-ranks live as they move.
  const ranked = useNearbyListings(listings, driverLocation);
  const sortedByLocation = driverLocation !== null;

  async function handleAccept(load: Listing): Promise<void> {
    if (carrierTenantId === null) {
      setErrorMessage('Your carrier account is still loading — try again in a moment.');
      return;
    }
    setErrorMessage(null);
    setAcceptingLoadId(load.loadId);
    try {
      const res = await dispatchAction(getIdToken, 'acceptLoad', { carrierTenantId, loadId: load.loadId }, genRequestId());
      if (res.ok) {
        onAccepted();
      } else {
        setErrorMessage(res.error.message);
        onChanged();
      }
    } finally {
      setAcceptingLoadId(null);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Available Loads</h1>
        <p className="text-gray-600">
          {sortedByLocation ? 'Sorted by nearest pickup to you' : 'Find your next haul'}
        </p>
      </div>

      {!tracking && onEnableLocation && listings.length > 0 && (
        <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <p className="text-sm text-blue-800 flex-1">
            Turn on location to sort loads by the nearest pickup to you — the list re-orders as you drive.
          </p>
          <button
            onClick={onEnableLocation}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Enable location
          </button>
        </div>
      )}

      {hasActiveJob && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            You have a job in progress. Complete it on the Active Jobs page before accepting another.
          </p>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-800">{errorMessage}</p>
        </div>
      )}

      {listings.length === 0 ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <div className="text-gray-400 mb-4">
            <Package className="w-16 h-16 mx-auto" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Loads Available</h3>
          <p className="text-gray-600">Check back later for new hauls.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {ranked.map(({ listing: load, distanceMeters }) => (
            <JobCard key={load.loadId}>
              <JobCardRoute
                badge={<JobCardStatusBadge status="available" />}
                origin={`${load.origin.town}, ${load.origin.postcode}`}
                destination={`${load.destination.town}, ${load.destination.postcode}`}
              />

              {distanceMeters !== null && (
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-sm font-medium text-blue-700">
                  <Navigation className="w-3.5 h-3.5" />
                  {(distanceMeters / 1000).toFixed(1)} km away
                </div>
              )}

              <JobCardPayment amount={formatGbp(load.priceGbpPence)} />

              {expandedLoadId === load.loadId && (
                <JobCardSection>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {load.route !== undefined && (
                      <div>
                        <div className="text-xs text-gray-500">Distance</div>
                        <div className="font-medium text-gray-900">
                          {Math.round(load.route.distanceMeters / 1000)} km
                        </div>
                      </div>
                    )}
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
                      <div className="text-xs text-gray-500">Pickup by</div>
                      <div className="font-medium text-gray-900">{load.pickupBy}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Deliver by</div>
                      <div className="font-medium text-gray-900">{load.deliverBy}</div>
                    </div>
                  </div>
                  {load.description && <div className="mt-3 text-sm text-gray-600">{load.description}</div>}
                </JobCardSection>
              )}

              <JobCardActions>
                <button
                  onClick={() => void handleAccept(load)}
                  disabled={hasActiveJob || acceptingLoadId === load.loadId}
                  className="w-full sm:flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                >
                  {acceptingLoadId === load.loadId ? 'Accepting...' : 'Accept Load'}
                </button>
                <button
                  onClick={() => setExpandedLoadId(expandedLoadId === load.loadId ? null : load.loadId)}
                  className="w-full sm:w-auto px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {expandedLoadId === load.loadId ? 'Hide Details' : 'View Details'}
                </button>
              </JobCardActions>
            </JobCard>
          ))}
        </div>
      )}
    </div>
  );
}
