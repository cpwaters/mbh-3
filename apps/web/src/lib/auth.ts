import { FirebaseAuthClient } from '@mbh/provider-firebase-auth-web';
import type { AuthClient } from '@mbh/provider-interfaces';
import { firebaseConfig, useEmulators } from './firebase-config';

let client: AuthClient | null = null;

// Runs in the browser only (the island is client:only), so it is safe to
// initialise Firebase here. Cached for the app's lifetime.
export function getAuthClient(): AuthClient {
  if (client !== null) return client;
  client = new FirebaseAuthClient({
    config: firebaseConfig,
    ...(useEmulators ? { emulatorUrl: 'http://localhost:9099' } : {}),
  });
  return client;
}
