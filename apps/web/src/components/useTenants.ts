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
}

export function useTenants(actorId: string | null): TenantsState {
  const reader = useMemo(getReader, []);
  const [loading, setLoading] = useState(actorId !== null);
  const [tenants, setTenants] = useState<Membership[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
      setLoading(false);
      setTenants([]);
      setSelectedId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
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
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setTenants([]);
        setSelectedId(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reader, actorId]);

  const selected = tenants.find((t) => t.tenantId === selectedId) ?? null;
  return { loading, tenants, selected, select };
}
