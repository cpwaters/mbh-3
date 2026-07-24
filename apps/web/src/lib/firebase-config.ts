// The shared Firebase web config. PUBLIC (its security is Firestore rules +
// server token verification, never secrecy of the apiKey) — so it is baked
// into the client bundle. Used by both the auth client and the Firestore
// reader so they share one Firebase app. projectId is overridable so the
// emulator-flavoured bundle can join the E2E emulator's namespace.
export const firebaseConfig = {
  apiKey: 'AIzaSyCtDB5ylX9svG7Ctsbre03kbgS7yG5G5cw',
  authDomain: 'mybackhaul-app.firebaseapp.com',
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID ?? 'mybackhaul-app',
  storageBucket: 'mybackhaul-app.firebasestorage.app',
  messagingSenderId: '236030171767',
  appId: '1:236030171767:web:73a6dcda8686252e854472',
};

export const useEmulators = import.meta.env.PUBLIC_USE_EMULATORS === 'true';
