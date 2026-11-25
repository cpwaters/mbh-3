import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_FEATURE_FLAGS, type FeatureFlags } from '@mbh/domain';
import { getReader } from '../lib/reader';

export interface FeatureFlagsState {
  flags: FeatureFlags;
  loading: boolean;
  reload: () => void;
}

// The platform's feature switches. Until they have loaded, or if the read
// fails, every feature reads as off: a switched-off feature must never flash
// up on screen.
export function useFeatureFlags(): FeatureFlagsState {
  const reader = useMemo(getReader, []);
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    reader
      .featureFlags()
      .then((next) => {
        if (!cancelled) setFlags(next);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reader, nonce]);

  return { flags, loading, reload };
}
