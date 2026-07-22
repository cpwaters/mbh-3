import { afterAll, beforeAll } from 'vitest';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { describeDataStoreContract } from '@mbh/provider-interfaces/contract';
import { FirestoreDataStore } from './firestore-datastore.js';

// The SAME DataStore contract suite, run against real Firestore on the
// emulator. If this passes alongside the mock's run of the identical suite,
// mock-first CI is provably faithful to production behaviour.
//
// Requires the Firestore emulator (started by firebase emulators:exec, which
// injects FIRESTORE_EMULATOR_HOST). Excluded from the normal unit suite via
// the .contract.test.ts name.

const PROJECT_ID = 'demo-mbh';
const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080';

let db: Firestore;
let app: ReturnType<typeof initializeApp>;

beforeAll(() => {
  // No credential needed: the emulator (FIRESTORE_EMULATOR_HOST) accepts any
  // request. projectId alone is enough.
  app = initializeApp({ projectId: PROJECT_ID }, 'contract-test');
  db = getFirestore(app);
});

afterAll(async () => {
  await deleteApp(app);
});

async function clearEmulator(): Promise<void> {
  const res = await fetch(
    `http://${EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
  if (!res.ok) throw new Error(`failed to clear emulator: ${res.status}`);
}

describeDataStoreContract('FirestoreDataStore (emulator)', async () => {
  await clearEmulator();
  return new FirestoreDataStore(db);
});
