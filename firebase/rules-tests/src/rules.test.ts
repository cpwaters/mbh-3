import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

// Every collection gets explicit allow AND deny cases. A client is an actor
// (auth.uid == actorId). All writes are server-only, so client writes must
// always fail; reads are membership-gated.

let env: RulesTestEnvironment;

// Actors used across tests.
const SHIP_OWNER = 'ship-owner';
const CAR_DRIVER = 'driver-1';
const OUTSIDER = 'outsider';
const DISABLED = 'driver-disabled';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-mbh',
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  // Seed baseline business data with admin (rules bypassed).
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'tenants/shipper-1'), { tenantId: 'shipper-1', name: 'Acme', capabilities: ['shipper'] });
    await setDoc(doc(db, 'tenants/carrier-1'), { tenantId: 'carrier-1', name: 'Waters', capabilities: ['carrier'] });
    await setDoc(doc(db, `tenants/shipper-1/members/${SHIP_OWNER}`), { tenantId: 'shipper-1', actorId: SHIP_OWNER, role: 'owner', status: 'active' });
    await setDoc(doc(db, `tenants/carrier-1/members/${CAR_DRIVER}`), { tenantId: 'carrier-1', actorId: CAR_DRIVER, role: 'driver', status: 'active' });
    await setDoc(doc(db, `tenants/carrier-1/members/${DISABLED}`), { tenantId: 'carrier-1', actorId: DISABLED, role: 'driver', status: 'disabled' });
    await setDoc(doc(db, 'loads/load-1'), { loadId: 'load-1', tenantId: 'shipper-1', status: 'available', priceGbpPence: 68000 });
    await setDoc(doc(db, 'jobs/job-1'), { jobId: 'job-1', loadId: 'load-1', shipperTenantId: 'shipper-1', carrierTenantId: 'carrier-1', driverActorId: CAR_DRIVER, status: 'accepted' });
    await setDoc(doc(db, 'jobs/job-1/events/evt-1'), { eventId: 'evt-1', jobId: 'job-1', type: 'job.accepted', source: 'member', actorId: CAR_DRIVER });
    await setDoc(doc(db, 'audit/audit-1'), { auditId: 'audit-1', action: 'acceptLoad', actorId: CAR_DRIVER });
    await setDoc(doc(db, 'requests/req-1'), { requestId: 'req-1', actionType: 'acceptLoad', result: { jobId: 'job-1' } });
  });
});

function db(actorId: string | null) {
  return actorId === null ? env.unauthenticatedContext().firestore() : env.authenticatedContext(actorId).firestore();
}

describe('tenants + members', () => {
  it('an active member reads their tenant and member docs', async () => {
    await assertSucceeds(getDoc(doc(db(SHIP_OWNER), 'tenants/shipper-1')));
    await assertSucceeds(getDoc(doc(db(SHIP_OWNER), `tenants/shipper-1/members/${SHIP_OWNER}`)));
  });

  it('a non-member cannot read another tenant', async () => {
    await assertFails(getDoc(doc(db(CAR_DRIVER), 'tenants/shipper-1')));
    await assertFails(getDoc(doc(db(OUTSIDER), 'tenants/shipper-1')));
  });

  it('a disabled member is refused', async () => {
    await assertFails(getDoc(doc(db(DISABLED), 'tenants/carrier-1')));
  });

  it('no client can write a tenant or member', async () => {
    await assertFails(setDoc(doc(db(SHIP_OWNER), 'tenants/shipper-1'), { name: 'Hacked' }));
    await assertFails(setDoc(doc(db(SHIP_OWNER), `tenants/shipper-1/members/${SHIP_OWNER}`), { role: 'owner', status: 'active', tenantId: 'shipper-1', hacked: true }));
  });
});

describe('loads (shipper-private)', () => {
  it('an active member of the owning shipper reads the load', async () => {
    await assertSucceeds(getDoc(doc(db(SHIP_OWNER), 'loads/load-1')));
  });

  it('a carrier / outsider / anonymous cannot read a raw load', async () => {
    await assertFails(getDoc(doc(db(CAR_DRIVER), 'loads/load-1')));
    await assertFails(getDoc(doc(db(OUTSIDER), 'loads/load-1')));
    await assertFails(getDoc(doc(db(null), 'loads/load-1')));
  });

  it('no client can write a load', async () => {
    await assertFails(setDoc(doc(db(SHIP_OWNER), 'loads/load-1'), { tenantId: 'shipper-1', status: 'cancelled' }));
  });
});

describe('jobs + events (shared cross-tenant record)', () => {
  it('members of either side read the job and its events', async () => {
    await assertSucceeds(getDoc(doc(db(SHIP_OWNER), 'jobs/job-1')));
    await assertSucceeds(getDoc(doc(db(CAR_DRIVER), 'jobs/job-1')));
    await assertSucceeds(getDoc(doc(db(SHIP_OWNER), 'jobs/job-1/events/evt-1')));
    await assertSucceeds(getDoc(doc(db(CAR_DRIVER), 'jobs/job-1/events/evt-1')));
  });

  it('an outsider cannot read the job or its events', async () => {
    await assertFails(getDoc(doc(db(OUTSIDER), 'jobs/job-1')));
    await assertFails(getDoc(doc(db(OUTSIDER), 'jobs/job-1/events/evt-1')));
  });

  it('no client can write a job or event', async () => {
    await assertFails(setDoc(doc(db(CAR_DRIVER), 'jobs/job-1'), { status: 'delivered', shipperTenantId: 'shipper-1', carrierTenantId: 'carrier-1' }));
    await assertFails(setDoc(doc(db(CAR_DRIVER), 'jobs/job-1/events/evt-hack'), { type: 'job.delivered', source: 'member' }));
  });
});

describe('audit + request markers (never client-readable)', () => {
  it('no one reads audit', async () => {
    await assertFails(getDoc(doc(db(SHIP_OWNER), 'audit/audit-1')));
    await assertFails(getDoc(doc(db(CAR_DRIVER), 'audit/audit-1')));
  });

  it('no one reads idempotency markers', async () => {
    await assertFails(getDoc(doc(db(CAR_DRIVER), 'requests/req-1')));
  });

  it('no client can forge an outcome by writing audit or a marker', async () => {
    await assertFails(setDoc(doc(db(CAR_DRIVER), 'audit/audit-x'), { action: 'forged' }));
    await assertFails(setDoc(doc(db(CAR_DRIVER), 'requests/req-x'), { actionType: 'forged' }));
  });
});

describe('deny-by-default', () => {
  it('an unknown collection is denied read and write', async () => {
    await assertFails(getDoc(doc(db(SHIP_OWNER), 'secrets/s1')));
    await assertFails(setDoc(doc(db(SHIP_OWNER), 'secrets/s1'), { x: 1 }));
  });
});
