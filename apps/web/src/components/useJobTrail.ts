import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JobTrail } from '@mbh/provider-interfaces';
import { getReader } from '../lib/reader';

// Where a load actually got to, for the shipper following it.
//
// Polls rather than subscribes: the breadcrumbs arrive roughly once a mile,
// so a live listener would spend almost all of its time idle on an open
// socket. A poll while the panel is open is the cheaper shape and matches
// how the rest of the app reads.
const POLL_MS = 30_000;

export interface JobTrailState {
  loading: boolean;
  trail: JobTrail | null;
  error: string | null;
  reload: () => void;
}

// `enabled` is how the caller says the panel is open. Closed means no reads
// at all, rather than a hidden poll running for every load on the screen.
export function useJobTrail(loadId: string | null, shipperTenantId: string | null, enabled: boolean): JobTrailState {
  const reader = useMemo(getReader, []);
  const [trail, setTrail] = useState<JobTrail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || loadId === null || shipperTenantId === null) {
      setTrail(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const read = (isFirst: boolean): void => {
      if (isFirst) setLoading(true);
      reader
        .trailForLoad(loadId, shipperTenantId)
        .then((t) => {
          if (cancelled) return;
          setTrail(t);
          setError(null);
        })
        .catch(() => {
          if (cancelled) return;
          // A refresh that fails leaves the trail we already have on screen —
          // stale but true — rather than blanking it.
          setError('Could not refresh the location just now.');
        })
        .finally(() => {
          if (!cancelled && isFirst) setLoading(false);
        });
    };

    read(true);
    timer = setInterval(() => read(false), POLL_MS);
    return () => {
      cancelled = true;
      if (timer !== null) clearInterval(timer);
    };
  }, [reader, loadId, shipperTenantId, enabled, nonce]);

  return { loading, trail, error, reload };
}
