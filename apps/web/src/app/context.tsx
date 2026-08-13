import { createContext, useContext } from 'react';
import type { DeliverCapture } from '@mbh/client';
import type { Listing } from '@mbh/domain';
import type { DriverJobView, Membership } from '@mbh/provider-interfaces';
import type { AuthView } from '../components/useAuth';
import type { QueueView } from '../components/useSyncQueue';
import type { DrivingTimersView } from '../components/useDrivingTimers';
import type { GeoPoint } from '../lib/geocode';

// The shared app state, resolved once in the shell and read by every page.
export interface AppData {
  auth: AuthView;
  queue: QueueView;
  tenants: Membership[];
  selected: Membership | null;
  selectTenant: (tenantId: string) => void;
  reloadTenants: () => void;
  isShipper: boolean;
  isCarrier: boolean;
  job: DriverJobView | null;
  reloadJob: () => void;
  listings: Listing[];
  reloadListings: () => void;
  // Resolves true when the capture reached the server (the job is no longer
  // the driver's active one); false when it is still sitting in the queue.
  commit: (requestId: string, payload: DeliverCapture) => Promise<boolean>;
  onAccepted: () => void;
  // Live device GPS + the journey progress derived from it. Progress is null
  // until there's a fix and known endpoints; the map marker reads `location`.
  location: GeoPoint | null;
  tracking: boolean;
  // A location watch is open (permission granted, this session or a prior
  // one) but no fix has landed yet — distinct from `tracking`, so the UI can
  // show "waiting for a GPS signal" instead of an "Enable location" button
  // that would do nothing if clicked (the watch is already running).
  watchingLocation: boolean;
  locationError: string | null;
  requestLocation: () => void;
  progress: number | null;
  distanceRemainingMeters: number | null;
  // The HGV driving-hours/break countdown timers — owned once here so they
  // keep running and their state survives navigating away from the Driving
  // Time page and back.
  drivingTimers: DrivingTimersView;
}

const Ctx = createContext<AppData | null>(null);

export function useApp(): AppData {
  const v = useContext(Ctx);
  if (v === null) throw new Error('useApp must be used within the app shell');
  return v;
}

export const AppProvider = Ctx.Provider;
