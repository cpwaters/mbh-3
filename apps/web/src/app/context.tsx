import { createContext, useContext } from 'react';
import type { DeliverCapture } from '@mbh/client';
import type { Listing } from '@mbh/domain';
import type { DriverJobView, Membership } from '@mbh/provider-interfaces';
import type { AuthView } from '../components/useAuth';
import type { QueueView } from '../components/useSyncQueue';

// The shared app state, resolved once in the shell and read by every page.
export interface AppData {
  auth: AuthView;
  queue: QueueView;
  tenants: Membership[];
  selected: Membership | null;
  selectTenant: (tenantId: string) => void;
  isShipper: boolean;
  isCarrier: boolean;
  job: DriverJobView | null;
  reloadJob: () => void;
  listings: Listing[];
  reloadListings: () => void;
  commit: (requestId: string, payload: DeliverCapture) => Promise<void>;
  onAccepted: () => void;
}

const Ctx = createContext<AppData | null>(null);

export function useApp(): AppData {
  const v = useContext(Ctx);
  if (v === null) throw new Error('useApp must be used within the app shell');
  return v;
}

export const AppProvider = Ctx.Provider;
