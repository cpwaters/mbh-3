import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Listing } from '@mbh/domain';
import { getReader } from '../lib/reader';

// Resolves the signed-in user's carrier tenant (first membership — single-tenant
// for now) and reads the available listings. `reload` re-reads after an accept.
export interface BrowseState {
  loading: boolean;
  carrierTenantId: string | null;
  listings: Listing[];
  reload: () => void;
}

export function useCarrierBrowse(actorId: string | null): BrowseState {
  const reader = useMemo(getReader, []);
  const [loading, setLoading] = useState(actorId !== null);
  const [carrierTenantId, setCarrierTenantId] = useState<string | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (actorId === null) {
      setLoading(false);
      setCarrierTenantId(null);
      setListings([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([reader.membershipsFor(actorId), reader.availableListings()])
      .then(([memberships, available]) => {
        if (cancelled) return;
        setCarrierTenantId(memberships[0]?.tenantId ?? null);
        setListings(available);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCarrierTenantId(null);
        setListings([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reader, actorId, nonce]);

  return { loading, carrierTenantId, listings, reload };
}
