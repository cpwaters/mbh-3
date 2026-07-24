import { useEffect, useMemo, useState } from 'react';
import type { DriverJobView } from '@mbh/provider-interfaces';
import { getJobReader } from '../lib/jobs';

export interface ActiveJobState {
  loading: boolean;
  job: DriverJobView | null;
}

// Reads the signed-in driver's current job from Firestore. Re-reads when the
// signed-in actor changes; a null actor (signed out) resolves to no job.
export function useActiveJob(actorId: string | null): ActiveJobState {
  const reader = useMemo(getJobReader, []);
  const [state, setState] = useState<ActiveJobState>({ loading: actorId !== null, job: null });

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
  }, [reader, actorId]);

  return state;
}
