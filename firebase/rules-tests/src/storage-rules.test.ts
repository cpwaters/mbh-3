import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';

// PoD photo uploads: write-only for the job's assigned driver, scoped to
// their own job path, never client-readable. storage.rules cross-checks
// Firestore (firestore.get()), so this environment needs BOTH emulators.

let env: RulesTestEnvironment;

const CAR_DRIVER = 'driver-1';
const OTHER_DRIVER = 'driver-2';

const TINY_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]); // just needs a content-type + size, not a valid image
const TOO_BIG = new Uint8Array(11 * 1024 * 1024); // over the 10MB rule cap

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mbh',
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: readFileSync(new URL('../../storage.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'jobs/job-1'), {
      jobId: 'job-1',
      driverActorId: CAR_DRIVER,
      status: 'in_transit',
    });
  });
});

function storage(actorId: string | null) {
  return actorId === null ? env.unauthenticatedContext().storage() : env.authenticatedContext(actorId).storage();
}

describe('storage.rules — PoD photo uploads', () => {
  it("the job's assigned driver can upload a photo for their own job", async () => {
    await assertSucceeds(
      uploadBytes(ref(storage(CAR_DRIVER), 'pod/job-1/req-1/0.jpg'), TINY_JPEG, { contentType: 'image/jpeg' })
    );
  });

  it("another driver cannot upload to someone else's job", async () => {
    await assertFails(
      uploadBytes(ref(storage(OTHER_DRIVER), 'pod/job-1/req-1/0.jpg'), TINY_JPEG, { contentType: 'image/jpeg' })
    );
  });

  it('an unauthenticated request is refused', async () => {
    await assertFails(
      uploadBytes(ref(storage(null), 'pod/job-1/req-1/0.jpg'), TINY_JPEG, { contentType: 'image/jpeg' })
    );
  });

  it('a non-image content type is refused', async () => {
    await assertFails(
      uploadBytes(ref(storage(CAR_DRIVER), 'pod/job-1/req-1/0.jpg'), TINY_JPEG, { contentType: 'application/pdf' })
    );
  });

  it('a file over the 10MB cap is refused', async () => {
    await assertFails(
      uploadBytes(ref(storage(CAR_DRIVER), 'pod/job-1/req-1/0.jpg'), TOO_BIG, { contentType: 'image/jpeg' })
    );
  });

  it('no one can read a PoD photo directly — only the drain (admin SDK) ever does', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), 'pod/job-1/req-1/0.jpg'), TINY_JPEG, { contentType: 'image/jpeg' });
    });
    const { getDownloadURL } = await import('firebase/storage');
    await assertFails(getDownloadURL(ref(storage(CAR_DRIVER), 'pod/job-1/req-1/0.jpg')));
  });

  it('an unrelated path is denied entirely', async () => {
    await assertFails(uploadBytes(ref(storage(CAR_DRIVER), 'other/whatever.jpg'), TINY_JPEG, { contentType: 'image/jpeg' }));
  });
});
