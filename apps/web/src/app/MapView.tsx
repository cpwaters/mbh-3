import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Navigation as NavIcon, MapPin } from 'lucide-react';
import { formatGbp } from '@mbh/domain';
import { useApp } from './context';
import LiveLocationMap from './LiveLocationMap';
import { getDrivingRoute } from '../lib/routing';
import { getWhat3Words } from '../lib/w3w';
import { openNativeNavigation } from '../lib/nativeNav';
import type { GeoPoint } from '../lib/geocode';
import { JobCard, JobCardRoute, JobCardPayment, JobCardStatusBadge } from './JobCard';

// Rough progress from the job's real status.
const STATUS_PROGRESS: Record<string, number> = {
  accepted: 20,
  collected: 55,
  in_transit: 85,
  delivered: 100,
  closed: 100,
};

// Ported from the mbh-2 prototype (client/src/pages/MapView.tsx): the map + a
// Route Details panel + an available-loads list + the location-consent modal.
// The endpoints come already geocoded from mbh-3's server-computed job route;
// the road-following polyline and What3Words are fetched client-side, and the
// live GPS position is shown on the driver's own screen (no server write yet).
export default function MapView() {
  const app = useApp();
  const job = app.job;
  const route = job?.route ?? null;

  const originPin: GeoPoint | null = route ? { lat: route.origin.lat, lng: route.origin.lng } : null;
  const destinationPin: GeoPoint | null = route ? { lat: route.destination.lat, lng: route.destination.lng } : null;
  const originLabel = job ? `${job.origin.town}, ${job.origin.postcode}` : '';
  const destinationLabel = job ? `${job.destination.town}, ${job.destination.postcode}` : '';
  const distanceKm = route ? Math.round(route.distanceMeters / 1000) : null;
  const progress = job ? (STATUS_PROGRESS[job.status] ?? 0) : 0;

  const [routeGeometry, setRouteGeometry] = useState<GeoPoint[] | null>(null);
  const [originW3W, setOriginW3W] = useState<string | null>(null);
  const [destinationW3W, setDestinationW3W] = useState<string | null>(null);
  const [currentLocation, setCurrentLocation] = useState<GeoPoint | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [showLocationConsent, setShowLocationConsent] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const originLat = originPin?.lat;
  const originLng = originPin?.lng;
  const destLat = destinationPin?.lat;
  const destLng = destinationPin?.lng;

  // Fetch an actual road-following route once both endpoints are known. Falls
  // back to a straight line (handled in LiveLocationMap) if this fails.
  useEffect(() => {
    if (originLat === undefined || originLng === undefined || destLat === undefined || destLng === undefined) {
      setRouteGeometry(null);
      return;
    }
    let cancelled = false;
    getDrivingRoute({ lat: originLat, lng: originLng }, { lat: destLat, lng: destLng }).then((r) => {
      if (!cancelled) setRouteGeometry(r);
    });
    return () => {
      cancelled = true;
    };
  }, [originLat, originLng, destLat, destLng]);

  useEffect(() => {
    if (originLat === undefined || originLng === undefined) {
      setOriginW3W(null);
      return;
    }
    getWhat3Words(originLat, originLng).then(setOriginW3W);
  }, [originLat, originLng]);

  useEffect(() => {
    if (destLat === undefined || destLng === undefined) {
      setDestinationW3W(null);
      return;
    }
    getWhat3Words(destLat, destLng).then(setDestinationW3W);
  }, [destLat, destLng]);

  // Stop tracking if we navigate away.
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  function beginLocationTracking() {
    if (!navigator.geolocation) {
      setLocationError('Location tracking is not supported on this device.');
      return;
    }
    setLocationError(null);
    const watchId = navigator.geolocation.watchPosition(
      (position) => setCurrentLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
      (error) => {
        setLocationError(
          error.code === error.PERMISSION_DENIED
            ? "Location access was denied, so your position can't be shown. Enable location for this site in your browser/device settings to turn it back on."
            : 'Could not get your location. Check location permissions and try again.'
        );
        setIsTracking(false);
      },
      { enableHighAccuracy: true }
    );
    watchIdRef.current = watchId;
    setIsTracking(true);
  }

  function handleToggleNavigation() {
    if (isTracking) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracking(false);
      return;
    }
    if (destinationPin) {
      openNativeNavigation(originPin, destinationPin);
    } else {
      setLocationError('Still working out the destination — try again in a moment.');
      return;
    }
    setLocationError(null);
    setShowLocationConsent(true);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Route Map</h1>
        <p className="text-gray-600">Navigate to your destination</p>
      </div>

      {job === null || route === null ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <MapPin className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Active Route</h3>
          <p className="text-gray-600">Accept a load to view your route</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md overflow-hidden border border-gray-200">
              <div className="h-[600px] relative">
                <LiveLocationMap
                  origin={originPin ? { ...originPin, label: originLabel } : undefined}
                  destination={destinationPin ? { ...destinationPin, label: destinationLabel } : undefined}
                  currentLocation={currentLocation ? { ...currentLocation, label: 'Current location' } : undefined}
                  routeGeometry={routeGeometry ?? undefined}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <NavIcon className="w-5 h-5 text-blue-600" />
                Route Details
              </h3>

              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-500">Route Progress</div>
                  <div className="text-2xl font-bold text-gray-900">{progress}%</div>
                </div>
                <div>
                  <div className="text-sm text-gray-500">Status</div>
                  <div className="text-lg font-semibold text-gray-900 capitalize">{job.status.replace('_', ' ')}</div>
                </div>
                <div className="pt-4 border-t">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>
              </div>

              {locationError && (
                <div className="mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{locationError}</span>
                </div>
              )}

              <button
                onClick={handleToggleNavigation}
                className={`w-full mt-6 px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                  isTracking ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                <NavIcon className="w-5 h-5" />
                {isTracking ? 'Stop Navigation' : 'Start Navigation'}
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <h3 className="font-semibold text-gray-900 mb-4">Route Information</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="bg-green-100 p-1 rounded-full mt-1">
                    <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">Origin</div>
                    <div className="text-sm text-gray-500">{originLabel}</div>
                    {originW3W && <div className="text-xs text-blue-600 font-mono mt-0.5">///{originW3W}</div>}
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-red-100 p-1 rounded-full mt-1">
                    <div className="w-2 h-2 bg-red-600 rounded-full"></div>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">Destination</div>
                    <div className="text-sm text-gray-500">{destinationLabel}</div>
                    {destinationW3W && <div className="text-xs text-blue-600 font-mono mt-0.5">///{destinationW3W}</div>}
                  </div>
                </div>
                {distanceKm !== null && (
                  <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                    <div className="bg-blue-100 p-1.5 rounded-full">
                      <NavIcon className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">Distance</div>
                      <div className="text-sm text-gray-500">{distanceKm} km</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Available loads</h2>
        {app.listings.length === 0 ? (
          <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-600">No loads found.</div>
        ) : (
          <div className="grid gap-4">
            {app.listings.map((l) => (
              <JobCard key={l.loadId}>
                <JobCardRoute
                  badge={<JobCardStatusBadge status="available" />}
                  origin={`${l.origin.town}, ${l.origin.postcode}`}
                  destination={`${l.destination.town}, ${l.destination.postcode}`}
                />
                <JobCardPayment amount={formatGbp(l.priceGbpPence)} />
              </JobCard>
            ))}
          </div>
        )}
      </div>

      {showLocationConsent && (
        // z-index clears Leaflet's panes (up to 1000).
        <div className="fixed inset-0 bg-black/50 z-[1200] flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-blue-100 p-2 rounded-full">
                <MapPin className="w-5 h-5 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Share your location?</h3>
            </div>
            <p className="text-sm text-gray-600 mb-6">
              MyBackHaul uses your device's location to show your live position on the map while you're
              navigating this job. Your location stays on your device.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowLocationConsent(false);
                  beginLocationTracking();
                }}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Allow Location Access
              </button>
              <button
                onClick={() => setShowLocationConsent(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Not Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
