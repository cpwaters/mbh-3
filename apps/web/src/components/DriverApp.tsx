import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import type { DeliverCapture } from '@mbh/client';
import { useSyncQueue } from './useSyncQueue';
import { useAuth } from './useAuth';
import { useTenants } from './useTenants';
import { useActiveJob } from './useActiveJob';
import { useListings } from './useListings';
import { SignIn } from './SignIn';
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

// The app island (browser-only): auth gate + a client-side router with the
// prototype's pages (Dashboard, Active Jobs, Map, Driving Time, Earnings,
// Profile) behind the top-bar / bottom-tab Navigation.
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

  if (!auth.ready) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (auth.session === null) {
    return <SignIn auth={auth} />;
  }

  const app: AppData = {
    auth,
    queue,
    tenants: tenants.tenants,
    selected,
    selectTenant: tenants.select,
    isShipper,
    isCarrier,
    job,
    reloadJob,
    listings: listings.listings,
    reloadListings: listings.reload,
    commit,
    onAccepted,
  };

  const loading = tenants.loading || jobLoading || listings.loading;

  return (
    <AppProvider value={app}>
      <MemoryRouter>
        <div className="min-h-screen bg-gray-50 pb-16 lg:pb-0">
          <Navigation />
          {loading ? (
            <div className="max-w-4xl mx-auto px-4 py-6">
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
      </MemoryRouter>
    </AppProvider>
  );
}
