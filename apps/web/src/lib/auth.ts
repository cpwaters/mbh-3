import { FirebaseAuthClient } from '@mbh/provider-firebase-auth-web';
import type { AuthClient } from '@mbh/provider-interfaces';

// The app's auth composition root. The Firebase web config is PUBLIC (its
// security is Firestore rules + the server token verification, never secrecy of
// the apiKey). PUBLIC_USE_EMULATORS=true builds the emulator-flavoured bundle
// that points auth at the local Auth emulator — used by the E2E stack and
// local dev, and always rebuilt to the prod bundle before any deploy.
const firebaseConfig = {
  apiKey: 'AIzaSyCtDB5ylX9svG7Ctsbre03kbgS7yG5G5cw',
  authDomain: 'mybackhaul-app.firebaseapp.com',
  // Overridable so the emulator-flavoured bundle can share the E2E emulator's
  // project namespace (connectAuthEmulator ignores the apiKey/authDomain).
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID ?? 'mybackhaul-app',
  storageBucket: 'mybackhaul-app.firebasestorage.app',
  messagingSenderId: '236030171767',
  appId: '1:236030171767:web:73a6dcda8686252e854472',
};

const useEmulators = import.meta.env.PUBLIC_USE_EMULATORS === 'true';

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
