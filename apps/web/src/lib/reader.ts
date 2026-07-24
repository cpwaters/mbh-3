import { FirestoreReader } from '@mbh/provider-firestore-web';
import { firebaseConfig, useEmulators } from './firebase-config';

let reader: FirestoreReader | null = null;

// One Firestore reader for the app (job + listings + memberships), sharing the
// Firebase app with the auth client. Single instance so the emulator
// connection is made exactly once.
export function getReader(): FirestoreReader {
  if (reader !== null) return reader;
  reader = new FirestoreReader({
    config: firebaseConfig,
    ...(useEmulators ? { emulator: { host: 'localhost', port: 8080 } } : {}),
  });
  return reader;
}
