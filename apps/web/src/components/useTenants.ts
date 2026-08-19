import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Membership } from '@mbh/provider-interfaces';
import { getReader } from '../lib/reader';

const STORAGE_KEY = 'mbh_active_tenant';

// All of the signed-in user's tenants, plus which one they're "acting as".
// The selection persists across reloads and falls back to the first tenant if
// the stored one isn't among the user's memberships.
export interface TenantsState {
  loading: boolean;
  tenants: Membership[];
  selected: Membership | null;
  select: (tenantId: string) => void;
  reload: () => void;
}

export function useTenants(actorId: string | null): TenantsState {
  const reader = useMemo(getReader, []);
  const [tenants, setTenants] = useState<Membership[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Which actor the tenants in state actually belong to. Deriving `loading`
  // from this rather than holding it as its own flag closes a window that
  // matters now routing is in the URL: a session arrives one render before
  // this hook's effect runs, so a plain `loading` flag would still read false
  // with no tenants loaded — long enough for the router to conclude the user
  // is a driver, find no /vehicles route, and rewrite the address bar to '/'.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const select = useCallback((tenantId: string) => {
    setSelectedId(tenantId);
    try {
      window.localStorage.setItem(STORAGE_KEY, tenantId);
    } catch {
      // private mode / storage disabled — selection just won't persist
    }
  }, []);

  useEffect(() => {
    if (actorId === null) {
      setTenants([]);
      setSelectedId(null);
      setLoadedFor(null);
      return;
    }
    let cancelled = false;
    reader
      .membershipsFor(actorId)
      .then((ms) => {
        if (cancelled) return;
        let stored: string | null = null;
        try {
          stored = window.localStorage.getItem(STORAGE_KEY);
        } catch {
          stored = null;
        }
        const valid = ms.some((m) => m.tenantId === stored) ? stored : (ms[0]?.tenantId ?? null);
        setTenants(ms);
        setSelectedId(valid);
        setLoadedFor(actorId);
      })
      .catch(() => {
        if (cancelled) return;
        setTenants([]);
        setSelectedId(null);
        // Settled, even though it failed — otherwise the app spins forever.
        setLoadedFor(actorId);
      });
    return () => {
      cancelled = true;
    };
  }, [reader, actorId, nonce]);

  const selected = tenants.find((t) => t.tenantId === selectedId) ?? null;
  // A refetch (reload()) keeps the old list on screen rather than blanking the
  // app: only a first load for this actor counts as loading.
  const loading = actorId !== null && loadedFor !== actorId;
  return { loading, tenants, selected, select, reload };
}
