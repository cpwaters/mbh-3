import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Vehicle } from '@mbh/domain';
import { getReader } from '../lib/reader';

export interface VehiclesState {
  loading: boolean;
  vehicles: Vehicle[];
  reload: () => void;
}

// Reads a carrier tenant's active fleet from Firestore. Re-reads when the
// tenant changes or `reload` is called (just after adding/retiring). A null
// tenant (no carrier selected) resolves to an empty fleet.
export function useVehicles(tenantId: string | null): VehiclesState {
  const reader = useMemo(getReader, []);
  const [state, setState] = useState<{ loading: boolean; vehicles: Vehicle[] }>({
    loading: tenantId !== null,
    vehicles: [],
  });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (tenantId === null) {
      setState({ loading: false, vehicles: [] });
      return;
    }
    let cancelled = false;
    setState({ loading: true, vehicles: [] });
    reader
      .vehiclesForTenant(tenantId)
      .then((vehicles) => {
        if (!cancelled) setState({ loading: false, vehicles });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, vehicles: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [reader, tenantId, nonce]);

  return { ...state, reload };
}
