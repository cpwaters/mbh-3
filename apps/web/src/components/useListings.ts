import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Listing } from '@mbh/domain';
import { getReader } from '../lib/reader';

// Reads the available listings for the carrier browse. `reload` re-reads after
// an accept (the taken load leaves the list). Disabled (empty) when the user
// is not a carrier.
export interface ListingsState {
  loading: boolean;
  listings: Listing[];
  reload: () => void;
}

export function useListings(enabled: boolean): ListingsState {
  const reader = useMemo(getReader, []);
  const [loading, setLoading] = useState(enabled);
  const [listings, setListings] = useState<Listing[]>([]);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setListings([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    reader
      .availableListings()
      .then((available) => {
        if (!cancelled) {
          setListings(available);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setListings([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reader, enabled, nonce]);

  return { loading, listings, reload };
}
