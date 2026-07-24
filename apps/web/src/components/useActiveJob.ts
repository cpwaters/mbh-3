import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DriverJobView } from '@mbh/provider-interfaces';
import { getReader } from '../lib/reader';

export interface ActiveJobState {
  loading: boolean;
  job: DriverJobView | null;
  reload: () => void;
}

// Reads the signed-in driver's current job from Firestore. Re-reads when the
// signed-in actor changes or `reload` is called (e.g. just after accepting a
// load). A null actor (signed out) resolves to no job.
export function useActiveJob(actorId: string | null): ActiveJobState {
  const reader = useMemo(getReader, []);
  const [state, setState] = useState<{ loading: boolean; job: DriverJobView | null }>({
    loading: actorId !== null,
    job: null,
  });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (actorId === null) {
      setState({ loading: false, job: null });
      return;
    }
    let cancelled = false;
    setState({ loading: true, job: null });
    reader
      .activeJobForDriver(actorId)
      .then((job) => {
        if (!cancelled) setState({ loading: false, job });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, job: null });
      });
    return () => {
      cancelled = true;
    };
  }, [reader, actorId, nonce]);

  return { ...state, reload };
}
