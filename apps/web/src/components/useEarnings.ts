import { useEffect, useMemo, useState } from 'react';
import type { CompletedJobView } from '@mbh/provider-interfaces';
import { getReader } from '../lib/reader';

export interface EarningsState {
  loading: boolean;
  jobs: CompletedJobView[];
}

// Reads the signed-in driver's finished jobs (delivered/closed) from Firestore
// so the Earnings page can sum and list them. A null actor (signed out)
// resolves to an empty history.
export function useEarnings(actorId: string | null): EarningsState {
  const reader = useMemo(getReader, []);
  const [state, setState] = useState<EarningsState>({
    loading: actorId !== null,
    jobs: [],
  });

  useEffect(() => {
    if (actorId === null) {
      setState({ loading: false, jobs: [] });
      return;
    }
    let cancelled = false;
    setState({ loading: true, jobs: [] });
    reader
      .completedJobsForDriver(actorId)
      .then((jobs) => {
        if (!cancelled) setState({ loading: false, jobs });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, jobs: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [reader, actorId]);

  return state;
}
