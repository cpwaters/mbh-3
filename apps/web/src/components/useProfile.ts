import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserProfile } from '@mbh/domain';
import { getReader } from '../lib/reader';

export interface ProfileState {
  loading: boolean;
  profile: UserProfile | null;
  reload: () => void;
}

// Reads the signed-in user's own account profile from Firestore. Re-reads when
// the actor changes or `reload` is called (just after saving). A null actor
// (signed out) resolves to no profile.
export function useProfile(actorId: string | null): ProfileState {
  const reader = useMemo(getReader, []);
  const [state, setState] = useState<{ loading: boolean; profile: UserProfile | null }>({
    loading: actorId !== null,
    profile: null,
  });
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (actorId === null) {
      setState({ loading: false, profile: null });
      return;
    }
    let cancelled = false;
    // Note we do NOT set loading:true here. Loading is only ever true for the
    // very first fetch (seeded in useState); a `reload` (e.g. after saving)
    // refetches in the background without unmounting the edit form or flashing
    // out its "saved" feedback.
    reader
      .profileForActor(actorId)
      .then((profile) => {
        if (!cancelled) setState({ loading: false, profile });
      })
      .catch(() => {
        if (!cancelled) setState((prev) => ({ loading: false, profile: prev.profile }));
      });
    return () => {
      cancelled = true;
    };
  }, [reader, actorId, nonce]);

  return { ...state, reload };
}
