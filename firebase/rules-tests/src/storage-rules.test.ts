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
const DISABLED_MEMBER = 'driver-disabled';

const TINY_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]); // just needs a content-type + size, not a valid image
const TOO_BIG = new Uint8Array(11 * 1024 * 1024); // over the 10MB rule cap
const TOO_BIG_LOGO = new Uint8Array(3 * 1024 * 1024); // over the 2MB logo cap

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
    // A company, one active member and one who has been disabled — the
    // company-logo rules authorize on membership, not on a job.
    await setDoc(doc(ctx.firestore(), 'tenants/carrier-1'), { tenantId: 'carrier-1', name: 'Waters Haulage' });
    await setDoc(doc(ctx.firestore(), `tenants/carrier-1/members/${CAR_DRIVER}`), {
      tenantId: 'carrier-1',
      actorId: CAR_DRIVER,
      role: 'driver',
      status: 'active',
    });
    await setDoc(doc(ctx.firestore(), `tenants/carrier-1/members/${DISABLED_MEMBER}`), {
      tenantId: 'carrier-1',
      actorId: DISABLED_MEMBER,
      role: 'driver',
      status: 'disabled',
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

describe('storage.rules — company logos', () => {
  const LOGO = 'company-logos/carrier-1/req-1.png';

  it('an active member can upload their own company’s logo', async () => {
    await assertSucceeds(uploadBytes(ref(storage(CAR_DRIVER), LOGO), TINY_JPEG, { contentType: 'image/png' }));
  });

  it('an active member can read it back — the profile screen shows it', async () => {
    // The one thing clients may read out of Storage. PoD photos stay closed.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), LOGO), TINY_JPEG, { contentType: 'image/png' });
    });
    const { getDownloadURL } = await import('firebase/storage');
    await assertSucceeds(getDownloadURL(ref(storage(CAR_DRIVER), LOGO)));
  });

  it('a stranger to the company can neither write nor read it', async () => {
    await assertFails(uploadBytes(ref(storage(OTHER_DRIVER), LOGO), TINY_JPEG, { contentType: 'image/png' }));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await uploadBytes(ref(ctx.storage(), LOGO), TINY_JPEG, { contentType: 'image/png' });
    });
    const { getDownloadURL } = await import('firebase/storage');
    await assertFails(getDownloadURL(ref(storage(OTHER_DRIVER), LOGO)));
  });

  it('a disabled member is refused, like everywhere else', async () => {
    await assertFails(uploadBytes(ref(storage(DISABLED_MEMBER), LOGO), TINY_JPEG, { contentType: 'image/png' }));
  });

  it('signed out is refused', async () => {
    await assertFails(uploadBytes(ref(storage(null), LOGO), TINY_JPEG, { contentType: 'image/png' }));
  });

  it('a format the invoice cannot render is refused', async () => {
    await assertFails(
      uploadBytes(ref(storage(CAR_DRIVER), 'company-logos/carrier-1/req-1.svg'), TINY_JPEG, {
        contentType: 'image/svg+xml',
      })
    );
  });

  it('a logo over the 2MB cap is refused', async () => {
    await assertFails(uploadBytes(ref(storage(CAR_DRIVER), LOGO), TOO_BIG_LOGO, { contentType: 'image/png' }));
  });

  it('a member cannot write into another company’s folder', async () => {
    await assertFails(
      uploadBytes(ref(storage(CAR_DRIVER), 'company-logos/other-co/req-1.png'), TINY_JPEG, {
        contentType: 'image/png',
      })
    );
  });
});
