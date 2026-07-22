import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

// The loop-closing proof: POST to /api/dispatch through the REAL dispatch
// function running in the emulator — real Firebase token verification, real
// FirestoreDataStore, the real action registry — and assert it creates a job.
// This is the browser->server contract exercised end to end (minus the
// browser, which is step 8's E2E).
//
// Run via `pnpm test:functions` (builds functions, then wraps this in
// firebase emulators:exec --only functions,firestore,auth). The emulator
// injects FIRESTORE_EMULATOR_HOST + FIREBASE_AUTH_EMULATOR_HOST.

const PROJECT_ID = 'demo-mbh';
const REGION = 'europe-west2';
const FUNCTIONS_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? '127.0.0.1:5001';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099';

const dispatchUrl = (subpath: string) =>
  `http://${FUNCTIONS_HOST}/${PROJECT_ID}/${REGION}/dispatch${subpath}`;

let app: ReturnType<typeof initializeApp>;
let db: Firestore;

beforeAll(async () => {
  app = initializeApp({ projectId: PROJECT_ID }, 'fn-integration');
  db = getFirestore(app);

  // Seed a carrier tenant + an active driver, and an available load, with
  // admin (rules bypassed) — the states the UI would have reached already.
  await db.doc('tenants/carrier-1').set({ tenantId: 'carrier-1', name: 'Waters', capabilities: ['carrier'] });
  await db.doc('tenants/carrier-1/members/driver-1').set({ tenantId: 'carrier-1', actorId: 'driver-1', role: 'driver', status: 'active', displayName: 'Chris' });
  await db.doc('tenants/shipper-1').set({ tenantId: 'shipper-1', name: 'Acme', capabilities: ['shipper'] });
  await db.doc('loads/load-1').set({
    loadId: 'load-1',
    tenantId: 'shipper-1',
    status: 'available',
    origin: { line1: '1', town: 'T', postcode: 'M17 1WS' },
    destination: { line1: '2', town: 'U', postcode: 'EH6 6JJ' },
    consignment: { description: 'x', weightKg: 100, palletCount: 2 },
    priceGbpPence: 5000,
    pickupBy: '2026-08-02',
    deliverBy: '2026-08-03',
    createdAt: new Date().toISOString(),
  });
});

afterAll(async () => {
  await deleteApp(app);
});

async function idTokenFor(uid: string): Promise<string> {
  await getAuth(app).createUser({ uid }).catch(() => undefined);
  const customToken = await getAuth(app).createCustomToken(uid);
  const res = await fetch(
    `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    }
  );
  const body = (await res.json()) as { idToken?: string };
  if (body.idToken === undefined) throw new Error('failed to mint id token');
  return body.idToken;
}

describe('dispatch function (emulator, end to end)', () => {
  it('serves /health without auth', async () => {
    const res = await fetch(dispatchUrl('/health'));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, status: 'healthy' });
  });

  it('rejects an unauthenticated POST to /api/dispatch', async () => {
    const res = await fetch(dispatchUrl('/api/dispatch'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'acceptLoad', requestId: 'r-noauth', payload: { carrierTenantId: 'carrier-1', loadId: 'load-1' } }),
    });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: 'unauthenticated' } });
  });

  it('accepts a load end to end: real token -> real function -> Firestore job', async () => {
    const token = await idTokenFor('driver-1');
    const res = await fetch(dispatchUrl('/api/dispatch'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'acceptLoad', requestId: 'r-accept', payload: { carrierTenantId: 'carrier-1', loadId: 'load-1' } }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; result: { jobId: string } };
    expect(body.ok).toBe(true);
    expect(body.result.jobId).toBeTruthy();

    // The real Firestore now holds the job + matched load + append-only event.
    const job = await db.doc(`jobs/${body.result.jobId}`).get();
    expect(job.data()).toMatchObject({ status: 'accepted', driverActorId: 'driver-1', loadId: 'load-1' });
    expect((await db.doc('loads/load-1').get()).data()).toMatchObject({ status: 'matched' });
    const events = await db.collection(`jobs/${body.result.jobId}/events`).get();
    expect(events.docs.map((d) => d.data().type)).toContain('job.accepted');
  });

  it('replays an idempotent requestId, returning the original job', async () => {
    const token = await idTokenFor('driver-1');
    const post = () =>
      fetch(dispatchUrl('/api/dispatch'), {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: 'acceptLoad', requestId: 'r-accept', payload: { carrierTenantId: 'carrier-1', loadId: 'load-1' } }),
      }).then((r) => r.json() as Promise<{ result: { jobId: string } }>);
    const first = await post();
    const replay = await post();
    expect(replay.result.jobId).toBe(first.result.jobId);
  });
});
