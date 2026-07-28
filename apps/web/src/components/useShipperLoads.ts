import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ShipperLoad } from '@mbh/provider-interfaces';
import { getReader } from '../lib/reader';

export interface ShipperLoadsState {
  loading: boolean;
  loads: ShipperLoad[];
  reload: () => void;
}

// Reads the shipper tenant's own loads (the distributor "All Loads" page).
// Re-reads when the tenant changes or `reload` is called (e.g. after cancel).
export function useShipperLoads(tenantId: string | null): ShipperLoadsState {
  const reader = useMemo(getReader, []);
  const [state, setState] = useState<{ loading: boolean; loads: ShipperLoad[] }>({
    loading: tenantId !== null,
    loads: [],
  });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (tenantId === null) {
      setState({ loading: false, loads: [] });
      return;
    }
    let cancelled = false;
    setState({ loading: true, loads: [] });
    reader
      .loadsForShipper(tenantId)
      .then((loads) => {
        if (!cancelled) setState({ loading: false, loads });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, loads: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [reader, tenantId, nonce]);

  return { ...state, reload };
}
