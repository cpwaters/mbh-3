import { FirestoreJobReader } from '@mbh/provider-firestore-web';
import type { JobReader } from '@mbh/provider-interfaces';
import { firebaseConfig, useEmulators } from './firebase-config';

let reader: JobReader | null = null;

// Shares the Firebase app with the auth client (getApps()[0]). Reads the
// driver's active job directly from Firestore, rules-gated.
export function getJobReader(): JobReader {
  if (reader !== null) return reader;
  reader = new FirestoreJobReader({
    config: firebaseConfig,
    ...(useEmulators ? { emulator: { host: 'localhost', port: 8080 } } : {}),
  });
  return reader;
}
