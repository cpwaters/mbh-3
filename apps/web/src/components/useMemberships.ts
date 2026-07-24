import { useEffect, useMemo, useState } from 'react';
import { getReader } from '../lib/reader';

// Resolves the signed-in user's tenants and picks the shipper / carrier tenant
// to act as (first of each capability — single-tenant-per-role for now). This
// drives which sections the app shows.
export interface MembershipState {
  loading: boolean;
  shipperTenantId: string | null;
  carrierTenantId: string | null;
}

export function useMemberships(actorId: string | null): MembershipState {
  const reader = useMemo(getReader, []);
  const [state, setState] = useState<MembershipState>({
    loading: actorId !== null,
    shipperTenantId: null,
    carrierTenantId: null,
  });

  useEffect(() => {
    if (actorId === null) {
      setState({ loading: false, shipperTenantId: null, carrierTenantId: null });
      return;
    }
    let cancelled = false;
    setState({ loading: true, shipperTenantId: null, carrierTenantId: null });
    reader
      .membershipsFor(actorId)
      .then((memberships) => {
        if (cancelled) return;
        const shipper = memberships.find((m) => m.capabilities.includes('shipper'));
        const carrier = memberships.find((m) => m.capabilities.includes('carrier'));
        setState({
          loading: false,
          shipperTenantId: shipper?.tenantId ?? null,
          carrierTenantId: carrier?.tenantId ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, shipperTenantId: null, carrierTenantId: null });
      });
    return () => {
      cancelled = true;
    };
  }, [reader, actorId]);

  return state;
}
