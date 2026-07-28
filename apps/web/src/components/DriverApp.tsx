import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { DeliverCapture } from '@mbh/client';
import { useSyncQueue } from './useSyncQueue';
import { useAuth } from './useAuth';
import { useTenants } from './useTenants';
import { useActiveJob } from './useActiveJob';
import { useListings } from './useListings';
import Login from '../app/Login';
import SignUp from '../app/SignUp';
import { AppProvider, type AppData } from '../app/context';
import { Navigation } from '../app/Navigation';
import {
  Dashboard,
  ActiveJobsPage,
  MapPage,
  EarningsPage,
  DrivingTimePage,
  ProfilePage,
} from '../app/pages';

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
  const listings = useListings(isCarrier);

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
          ) : (
            <div className="pb-16 lg:pb-0">
              <Navigation />
              {loading ? (
                <div className="p-6 max-w-7xl mx-auto">
                  <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 text-gray-500">
                    Loading…
                  </div>
                </div>
              ) : (
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/active" element={<ActiveJobsPage />} />
                  <Route path="/map" element={<MapPage />} />
                  <Route path="/driving" element={<DrivingTimePage />} />
                  <Route path="/earnings" element={<EarningsPage />} />
                  <Route path="/profile" element={<ProfilePage />} />
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
