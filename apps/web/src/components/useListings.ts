import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Listing } from '@mbh/domain';
import { getReader } from '../lib/reader';

// How often the browse re-polls Firestore for new/updated loads, so the list
// stays live without a page refresh.
const POLL_MS = 30_000;

// Reads the available listings for the carrier browse. `reload` re-reads after
// an accept (the taken load leaves the list), and a background poll keeps the
// list fresh. Disabled (empty) when the user is not a carrier.
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
  // Tracks whether the first read has completed, so reloads/polls refresh
  // silently instead of flashing the app-wide loading state.
  const loadedRef = useRef(false);

  // Poll for new loads on an interval (a silent re-read; no spinner).
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNonce((n) => n + 1), POLL_MS);
    return () => window.clearInterval(id);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      setListings([]);
      loadedRef.current = false;
      return;
    }
    let cancelled = false;
    if (!loadedRef.current) setLoading(true);
    reader
      .availableListings()
      .then((available) => {
        if (!cancelled) {
          setListings(available);
          setLoading(false);
          loadedRef.current = true;
        }
      })
      .catch(() => {
        // Keep the last good list on a failed poll; don't blank the browse.
        if (!cancelled) {
          setLoading(false);
          loadedRef.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reader, enabled, nonce]);

  return { loading, listings, reload };
}
