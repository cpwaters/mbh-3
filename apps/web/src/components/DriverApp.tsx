import { useMemo } from 'react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { DeliverCapture } from '@mbh/client';
import { useSyncQueue } from './useSyncQueue';
import { useAuth } from './useAuth';
import { useTenants } from './useTenants';
import { useActiveJob } from './useActiveJob';
import { useListings } from './useListings';
import { useDeviceLocation } from './useDeviceLocation';
import { useJobEndpoints } from './useJobEndpoints';
import { useJobProgressSync } from './useJobProgressSync';
import { haversineMeters, journeyProgress } from '../lib/progress';
import Login from '../app/Login';
import SignUp from '../app/SignUp';
import { AppProvider, type AppData } from '../app/context';
import { Navigation } from '../app/Navigation';
import { Dashboard, ActiveJobsPage } from '../app/pages';
import MapView from '../app/MapView';
import Earnings from '../app/Earnings';
import DrivingTime from '../app/DrivingTime';
import Profile from '../app/Profile';
import EditProfile from '../app/EditProfile';
import AddVehicle from '../app/AddVehicle';
import DistributorNavigation from '../app/distributor/Navigation';
import LoadsList from '../app/distributor/LoadsList';
import CreateLoad from '../app/distributor/CreateLoad';

function LoadingCard() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 text-gray-500">Loading…</div>
    </div>
  );
}

// The app island (browser-only). Mirrors the mbh-2 prototype's App.tsx: one
// router, with unauthenticated (/login, /signup) routes when signed out and
// the Navigation + app pages when signed in. Data comes from mbh-3's secure
// backend (readers + dispatch + offline queue), exposed via the app context.
export default function DriverApp() {
  const auth = useAuth();
  const actorId = auth.session?.actorId ?? null;
  const queue = useSyncQueue(auth.getIdToken);
  const tenants = useTenants(actorId);
  const { loading: jobLoading, job, reload: reloadJob } = useActiveJob(actorId);
  const selected = tenants.selected;
  const isShipper = selected?.capabilities.includes('shipper') ?? false;
  const isCarrier = selected?.capabilities.includes('carrier') ?? false;
  // A shipper-only tenant sees the distributor app; carriers (incl. dual-cap)
  // see the driver app.
  const showDistributor = isShipper && !isCarrier;
  const listings = useListings(isCarrier);

  // Live device location + the GPS journey progress derived from it. Resolved
  // once here so every page reads the same fix and the driver is prompted for
  // location permission only once.
  const device = useDeviceLocation();
  const endpoints = useJobEndpoints(job);
  const progress = useMemo(() => {
    if (device.location && endpoints.origin && endpoints.destination) {
      return journeyProgress(endpoints.origin, endpoints.destination, device.location);
    }
    return null;
  }, [device.location, endpoints.origin, endpoints.destination]);
  const distanceRemainingMeters = useMemo(() => {
    if (device.location && endpoints.destination) {
      return haversineMeters(device.location, endpoints.destination);
    }
    return null;
  }, [device.location, endpoints.destination]);

  // GPS progress advances the real job status (accepted → collected →
  // in_transit) so a delivery is a legal transition when it's recorded.
  useJobProgressSync(job, progress, auth.getIdToken, reloadJob);

  async function commit(requestId: string, payload: DeliverCapture) {
    await queue.enqueue('deliverJob', payload, requestId);
  }
  function onAccepted() {
    reloadJob();
    listings.reload();
  }

  const app: AppData = {
    auth,
    queue,
    tenants: tenants.tenants,
    selected,
    selectTenant: tenants.select,
    reloadTenants: tenants.reload,
    isShipper,
    isCarrier,
    job,
    reloadJob,
    listings: listings.listings,
    reloadListings: listings.reload,
    commit,
    onAccepted,
    location: device.location,
    tracking: device.tracking,
    locationError: device.error,
    requestLocation: device.requestLocation,
    progress,
    distanceRemainingMeters,
  };

  if (!auth.ready) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const loading = tenants.loading || jobLoading || listings.loading;

  return (
    <AppProvider value={app}>
      <MemoryRouter>
        <div className="min-h-screen bg-gray-50">
          {auth.session === null ? (
            <Routes>
              <Route path="/login" element={<Login auth={auth} />} />
              <Route path="/signup" element={<SignUp auth={auth} />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          ) : showDistributor ? (
            <div className="pb-16 lg:pb-0">
              <DistributorNavigation />
              {loading ? (
                <LoadingCard />
              ) : (
                <Routes>
                  <Route path="/" element={<LoadsList />} />
                  <Route path="/create" element={<CreateLoad />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/profile/edit" element={<EditProfile />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              )}
            </div>
          ) : (
            <div className="pb-16 lg:pb-0">
              <Navigation />
              {loading ? (
                <LoadingCard />
              ) : (
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/active" element={<ActiveJobsPage />} />
                  <Route path="/map" element={<MapView />} />
                  <Route path="/driving" element={<DrivingTime />} />
                  <Route path="/earnings" element={<Earnings />} />
                  <Route path="/profile" element={<Profile />} />
                  <Route path="/profile/edit" element={<EditProfile />} />
                  <Route path="/vehicles/add" element={<AddVehicle />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              )}
            </div>
          )}
        </div>
      </MemoryRouter>
    </AppProvider>
  );
}
