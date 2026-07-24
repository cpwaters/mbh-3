import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AuthSession } from '@mbh/provider-interfaces';
import { getAuthClient } from '../lib/auth';

export interface AuthView {
  ready: boolean; // the initial session has resolved
  session: AuthSession | null;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

// Subscribes the UI to the AuthClient's session. getIdToken is stable across
// renders so it can be handed to the sync queue's composition root once.
export function useAuth(): AuthView {
  const auth = useMemo(getAuthClient, []);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return auth.subscribe((next) => {
      setSession(next);
      setReady(true);
    });
  }, [auth]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      await auth.signInWithPassword(email, password);
    },
    [auth]
  );
  const signInWithGoogle = useCallback(async () => {
    await auth.signInWithGoogle();
  }, [auth]);
  const signOut = useCallback(() => auth.signOut(), [auth]);
  const getIdToken = useCallback(() => auth.getIdToken(), [auth]);

  return { ready, session, signInWithPassword, signInWithGoogle, signOut, getIdToken };
}
