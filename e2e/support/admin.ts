import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

// Admin access to the EMULATORS (FIRESTORE_EMULATOR_HOST +
// FIREBASE_AUTH_EMULATOR_HOST are exported by `firebase emulators:exec`). The
// project id must match the emulator-flavoured web bundle
// (PUBLIC_FIREBASE_PROJECT_ID=demo-mbh) so the client and admin share one
// emulator namespace.
const PROJECT_ID = 'demo-mbh';

// The identities the E2E signs in as and delivers against.
export const E2E = {
  uid: 'driver-e2e',
  email: 'driver.e2e@haulier.test',
  password: 'test-password-123',
  carrierTenantId: 'carrier-e2e',
  jobId: 'job-e2e',
  // A driver with no active job (for the empty-state journey).
  joblessUid: 'driver-nojob-e2e',
  joblessEmail: 'nojob.e2e@haulier.test',
  joblessPassword: 'test-password-456',
} as const;

function app() {
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
}

async function ensureUser(uid: string, email: string, password: string): Promise<void> {
  const auth = getAuth();
  try {
    await auth.deleteUser(uid);
  } catch {
    // first run — no user to delete
  }
  await auth.createUser({ uid, email, password });
}

// Seed the auth users + the state the UI cannot reach (an in-transit job the
// signed-in driver owns, with its delivery details), so the sign-in → read the
// job from Firestore → capture → deliver loop can run.
export async function seedDeliverableJob(): Promise<void> {
  app();
  await ensureUser(E2E.uid, E2E.email, E2E.password);
  await ensureUser(E2E.joblessUid, E2E.joblessEmail, E2E.joblessPassword);

  const db = getFirestore();
  await db.doc(`tenants/${E2E.carrierTenantId}`).set({
    tenantId: E2E.carrierTenantId,
    name: 'Waters Haulage',
    capabilities: ['carrier'],
  });
  for (const uid of [E2E.uid, E2E.joblessUid]) {
    await db.doc(`tenants/${E2E.carrierTenantId}/members/${uid}`).set({
      tenantId: E2E.carrierTenantId,
      actorId: uid,
      role: 'driver',
      status: 'active',
      displayName: 'Test Driver',
    });
  }
  await db.doc(`jobs/${E2E.jobId}`).set({
    jobId: E2E.jobId,
    loadId: 'load-e2e',
    shipperTenantId: 'shipper-e2e',
    carrierTenantId: E2E.carrierTenantId,
    driverActorId: E2E.uid,
    status: 'in_transit',
    origin: { line1: '10 Distribution Way', town: 'Trafford', postcode: 'M17 1WS' },
    destination: { line1: '5 Harbour Road', town: 'Leith', postcode: 'EH6 6JJ' },
    createdAt: new Date().toISOString(),
  });
}

export async function getJobStatus(jobId: string): Promise<string | undefined> {
  app();
  const snap = await getFirestore().doc(`jobs/${jobId}`).get();
  return snap.data()?.status as string | undefined;
}
