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
  // A driver with no active job — browses and accepts the available load below.
  joblessUid: 'driver-nojob-e2e',
  joblessEmail: 'nojob.e2e@haulier.test',
  joblessPassword: 'test-password-456',
  browseLoadId: 'load-browse-e2e',
  // A shipper who posts loads through the UI.
  shipperUid: 'shipper-e2e-user',
  shipperEmail: 'shipper.e2e@acme.test',
  shipperPassword: 'test-password-789',
  shipperTenantId: 'shipper-e2e',
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
  await ensureUser(E2E.shipperUid, E2E.shipperEmail, E2E.shipperPassword);

  const db = getFirestore();
  await db.doc(`tenants/${E2E.carrierTenantId}`).set({
    tenantId: E2E.carrierTenantId,
    name: 'Waters Haulage',
    capabilities: ['carrier'],
  });
  // The shipper tenant + an owner member who posts loads.
  await db.doc(`tenants/${E2E.shipperTenantId}`).set({
    tenantId: E2E.shipperTenantId,
    name: 'Acme Distribution',
    capabilities: ['shipper'],
  });
  await db.doc(`tenants/${E2E.shipperTenantId}/members/${E2E.shipperUid}`).set({
    tenantId: E2E.shipperTenantId,
    actorId: E2E.shipperUid,
    role: 'owner',
    status: 'active',
    displayName: 'Acme Owner',
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

  // An available load + its listing for the browse-and-accept journey (a
  // distinct route so the browse is unambiguous). acceptLoad reads the raw load.
  await db.doc(`loads/${E2E.browseLoadId}`).set({
    loadId: E2E.browseLoadId,
    tenantId: 'shipper-e2e',
    status: 'available',
    origin: { line1: '1 Dock Road', town: 'Avonmouth', postcode: 'BS11 8DL' },
    destination: { line1: '2 Bay St', town: 'Cardiff', postcode: 'CF10 4UW' },
    consignment: { description: 'Steel coils', weightKg: 20000, palletCount: 8 },
    priceGbpPence: 42000,
    pickupBy: '2026-08-04',
    deliverBy: '2026-08-05',
    createdAt: new Date().toISOString(),
  });
  await db.doc(`listings/${E2E.browseLoadId}`).set({
    loadId: E2E.browseLoadId,
    shipperTenantId: 'shipper-e2e',
    origin: { town: 'Avonmouth', postcode: 'BS11 8DL' },
    destination: { town: 'Cardiff', postcode: 'CF10 4UW' },
    description: 'Steel coils',
    weightKg: 20000,
    palletCount: 8,
    priceGbpPence: 42000,
    pickupBy: '2026-08-04',
    deliverBy: '2026-08-05',
    postedAt: new Date().toISOString(),
  });
}

export async function getJobStatus(jobId: string): Promise<string | undefined> {
  app();
  const snap = await getFirestore().doc(`jobs/${jobId}`).get();
  return snap.data()?.status as string | undefined;
}
