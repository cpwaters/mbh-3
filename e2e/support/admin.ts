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
} as const;

function app() {
  if (getApps().length === 0) initializeApp({ projectId: PROJECT_ID });
}

// Seed an auth user + the state the UI cannot reach (an in-transit job the
// signed-in driver owns), so the sign-in → capture → deliver loop can run.
export async function seedDeliverableJob(): Promise<void> {
  app();
  const auth = getAuth();
  try {
    await auth.deleteUser(E2E.uid);
  } catch {
    // first run — no user to delete
  }
  await auth.createUser({ uid: E2E.uid, email: E2E.email, password: E2E.password });

  const db = getFirestore();
  await db.doc(`tenants/${E2E.carrierTenantId}`).set({
    tenantId: E2E.carrierTenantId,
    name: 'Waters Haulage',
    capabilities: ['carrier'],
  });
  await db.doc(`tenants/${E2E.carrierTenantId}/members/${E2E.uid}`).set({
    tenantId: E2E.carrierTenantId,
    actorId: E2E.uid,
    role: 'driver',
    status: 'active',
    displayName: 'Chris Waters',
  });
  await db.doc(`jobs/${E2E.jobId}`).set({
    jobId: E2E.jobId,
    loadId: 'load-e2e',
    shipperTenantId: 'shipper-e2e',
    carrierTenantId: E2E.carrierTenantId,
    driverActorId: E2E.uid,
    status: 'in_transit',
    createdAt: new Date().toISOString(),
  });
}

export async function getJobStatus(jobId: string): Promise<string | undefined> {
  app();
  const snap = await getFirestore().doc(`jobs/${jobId}`).get();
  return snap.data()?.status as string | undefined;
}
