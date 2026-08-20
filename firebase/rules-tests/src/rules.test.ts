import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, collectionGroup, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';

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
    await setDoc(doc(db, 'tenants/carrier-1/vehicles/veh-1'), { vehicleId: 'veh-1', tenantId: 'carrier-1', registration: 'AB12 CDE', type: 'artic', capacityKg: 26000, status: 'active' });
    await setDoc(doc(db, 'tenants/shipper-1/addressBook/addr-1'), { entryId: 'addr-1', tenantId: 'shipper-1', label: 'Tesco Trafford DC', companyName: 'Tesco', line1: '10 Distribution Way', town: 'Trafford', postcode: 'M17 1WS', contactName: 'John Smith', contactEmail: 'john@tesco.test', contactPhone: '', status: 'active', createdAt: '2026-08-13T09:00:00.000Z', createdBy: 'ship-owner', updatedAt: '2026-08-13T09:00:00.000Z' });
    await setDoc(doc(db, 'loads/load-1'), { loadId: 'load-1', tenantId: 'shipper-1', status: 'available', priceGbpPence: 68000 });
    await setDoc(doc(db, 'jobs/job-1'), { jobId: 'job-1', loadId: 'load-1', shipperTenantId: 'shipper-1', carrierTenantId: 'carrier-1', driverActorId: CAR_DRIVER, status: 'accepted' });
    await setDoc(doc(db, 'jobs/job-1/events/evt-1'), { eventId: 'evt-1', jobId: 'job-1', type: 'job.accepted', source: 'member', actorId: CAR_DRIVER });
    await setDoc(doc(db, 'jobs/job-1/evidence/evd-1'), { evidenceId: 'evd-1', jobId: 'job-1', kind: 'delivery', recipientName: 'J. Smith', actorId: CAR_DRIVER });
    await setDoc(doc(db, 'audit/audit-1'), { auditId: 'audit-1', action: 'acceptLoad', actorId: CAR_DRIVER });
    await setDoc(doc(db, 'requests/req-1'), { requestId: 'req-1', actionType: 'acceptLoad', result: { jobId: 'job-1' } });
    await setDoc(doc(db, 'outbox/task-1'), { taskId: 'task-1', type: 'enrichLoadRoute', status: 'pending', tenantId: 'shipper-1', loadId: 'load-1' });
    await setDoc(doc(db, 'outbox/test-email-1'), { taskId: 'test-email-1', type: 'sendTestInvoiceEmail', status: 'done', tenantId: 'shipper-1', recipientEmail: 'owner@acme.test', actorId: SHIP_OWNER });
    await setDoc(doc(db, 'listings/load-1'), { loadId: 'load-1', shipperTenantId: 'shipper-1', origin: { town: 'Trafford', postcode: 'M17 1WS' }, destination: { town: 'Leith', postcode: 'EH6 6JJ' }, priceGbpPence: 68000 });
    await setDoc(doc(db, `userProfiles/${CAR_DRIVER}`), { actorId: CAR_DRIVER, displayName: 'Chris Waters', phone: '07700 900123' });
    await setDoc(doc(db, 'invites/inv-1'), { inviteId: 'inv-1', status: 'pending', note: 'Waters Haulage', createdAt: '2026-08-19T09:00:00.000Z', createdBy: 'founder-1', expiresAt: '2026-08-26T09:00:00.000Z' });
  });
});

function db(actorId: string | null) {
  return actorId === null ? env.unauthenticatedContext().firestore() : env.authenticatedContext(actorId).firestore();
}

// The founder is identified by the email claim on their token.
function founderDb(email = 'nvwebdevelopers@gmail.com') {
  return env.authenticatedContext('founder-1', { email }).firestore();
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

describe('userProfiles (a user reads their own)', () => {
  it('a user reads their own profile', async () => {
    await assertSucceeds(getDoc(doc(db(CAR_DRIVER), `userProfiles/${CAR_DRIVER}`)));
  });

  it("a user cannot read someone else's profile, nor can an anonymous visitor", async () => {
    await assertFails(getDoc(doc(db(SHIP_OWNER), `userProfiles/${CAR_DRIVER}`)));
    await assertFails(getDoc(doc(db(null), `userProfiles/${CAR_DRIVER}`)));
  });

  it('no client can write a profile', async () => {
    await assertFails(
      setDoc(doc(db(CAR_DRIVER), `userProfiles/${CAR_DRIVER}`), {
        actorId: CAR_DRIVER,
        displayName: 'Hacked',
        phone: '',
      })
    );
  });
});

describe("addressBook (a shipper's saved addresses)", () => {
  it('an active member of the shipper reads an entry and lists the book', async () => {
    await assertSucceeds(getDoc(doc(db(SHIP_OWNER), 'tenants/shipper-1/addressBook/addr-1')));
    await assertSucceeds(getDocs(collection(db(SHIP_OWNER), 'tenants/shipper-1/addressBook')));
  });

  it('a non-member / disabled / anonymous cannot read the book', async () => {
    // It carries customer contact names, emails and phone numbers — company
    // -private, exactly like the raw loads it feeds.
    await assertFails(getDoc(doc(db(CAR_DRIVER), 'tenants/shipper-1/addressBook/addr-1')));
    await assertFails(getDoc(doc(db(DISABLED), 'tenants/shipper-1/addressBook/addr-1')));
    await assertFails(getDoc(doc(db(null), 'tenants/shipper-1/addressBook/addr-1')));
    await assertFails(getDocs(collection(db(CAR_DRIVER), 'tenants/shipper-1/addressBook')));
  });

  it('no client can write an entry — only the server, via the address-book actions', async () => {
    await assertFails(
      setDoc(doc(db(SHIP_OWNER), 'tenants/shipper-1/addressBook/addr-1'), {
        entryId: 'addr-1',
        tenantId: 'shipper-1',
        label: 'HACKED',
        status: 'active',
      })
    );
    await assertFails(
      setDoc(doc(db(SHIP_OWNER), 'tenants/shipper-1/addressBook/addr-new'), {
        entryId: 'addr-new',
        tenantId: 'shipper-1',
        label: 'Client-created',
        status: 'active',
      })
    );
  });
});

describe('vehicles (a carrier fleet)', () => {
  it('an active member of the carrier reads a vehicle and lists the fleet', async () => {
    await assertSucceeds(getDoc(doc(db(CAR_DRIVER), 'tenants/carrier-1/vehicles/veh-1')));
    await assertSucceeds(getDocs(collection(db(CAR_DRIVER), 'tenants/carrier-1/vehicles')));
  });

  it('a non-member / disabled / anonymous cannot read the fleet', async () => {
    await assertFails(getDoc(doc(db(SHIP_OWNER), 'tenants/carrier-1/vehicles/veh-1')));
    await assertFails(getDoc(doc(db(DISABLED), 'tenants/carrier-1/vehicles/veh-1')));
    await assertFails(getDoc(doc(db(null), 'tenants/carrier-1/vehicles/veh-1')));
  });

  it('no client can write a vehicle', async () => {
    await assertFails(
      setDoc(doc(db(CAR_DRIVER), 'tenants/carrier-1/vehicles/veh-1'), {
        vehicleId: 'veh-1',
        tenantId: 'carrier-1',
        registration: 'HACK 1',
        type: 'van',
        capacityKg: 1,
        status: 'active',
      })
    );
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

describe('memberships (a user reads their own across tenants)', () => {
  it('a user can collection-group query their own member docs', async () => {
    const mine = query(collectionGroup(db(CAR_DRIVER), 'members'), where('actorId', '==', CAR_DRIVER));
    await assertSucceeds(getDocs(mine));
  });

  it("a user cannot query someone else's memberships", async () => {
    const notMine = query(collectionGroup(db(CAR_DRIVER), 'members'), where('actorId', '==', SHIP_OWNER));
    await assertFails(getDocs(notMine));
  });
});

describe('listings (carrier-facing projection)', () => {
  it('any signed-in user (carrier included) can browse a listing', async () => {
    await assertSucceeds(getDoc(doc(db(CAR_DRIVER), 'listings/load-1')));
    await assertSucceeds(getDoc(doc(db(OUTSIDER), 'listings/load-1')));
  });

  it('an anonymous visitor cannot browse listings', async () => {
    await assertFails(getDoc(doc(db(null), 'listings/load-1')));
  });

  it('no client can write a listing', async () => {
    await assertFails(setDoc(doc(db(CAR_DRIVER), 'listings/load-x'), { loadId: 'load-x' }));
  });
});

describe('jobs + events (shared cross-tenant record)', () => {
  it('a driver can query their own jobs (the driver home)', async () => {
    const mine = query(collection(db(CAR_DRIVER), 'jobs'), where('driverActorId', '==', CAR_DRIVER));
    await assertSucceeds(getDocs(mine));
  });

  it('an outsider querying a real job is denied (a matched doc they cannot read)', async () => {
    const q = query(collection(db(OUTSIDER), 'jobs'), where('driverActorId', '==', CAR_DRIVER));
    await assertFails(getDocs(q));
  });

  it('members of either side read the job, its events, and its evidence', async () => {
    await assertSucceeds(getDoc(doc(db(SHIP_OWNER), 'jobs/job-1')));
    await assertSucceeds(getDoc(doc(db(CAR_DRIVER), 'jobs/job-1')));
    await assertSucceeds(getDoc(doc(db(SHIP_OWNER), 'jobs/job-1/events/evt-1')));
    await assertSucceeds(getDoc(doc(db(CAR_DRIVER), 'jobs/job-1/events/evt-1')));
    await assertSucceeds(getDoc(doc(db(SHIP_OWNER), 'jobs/job-1/evidence/evd-1')));
    await assertSucceeds(getDoc(doc(db(CAR_DRIVER), 'jobs/job-1/evidence/evd-1')));
  });

  it('an outsider cannot read the job, its events, or its evidence', async () => {
    await assertFails(getDoc(doc(db(OUTSIDER), 'jobs/job-1')));
    await assertFails(getDoc(doc(db(OUTSIDER), 'jobs/job-1/events/evt-1')));
    await assertFails(getDoc(doc(db(OUTSIDER), 'jobs/job-1/evidence/evd-1')));
  });

  it('no client can write a job, event, or evidence (no forging a PoD)', async () => {
    await assertFails(setDoc(doc(db(CAR_DRIVER), 'jobs/job-1'), { status: 'delivered', shipperTenantId: 'shipper-1', carrierTenantId: 'carrier-1' }));
    await assertFails(setDoc(doc(db(CAR_DRIVER), 'jobs/job-1/events/evt-hack'), { type: 'job.delivered', source: 'member' }));
    await assertFails(setDoc(doc(db(CAR_DRIVER), 'jobs/job-1/evidence/evd-hack'), { kind: 'delivery', recipientName: 'Forged' }));
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

describe('outbox (drain work — internal, except the founder test-email readback)', () => {
  it('no one reads a non-test-email outbox task, not even its own tenant owner', async () => {
    await assertFails(getDoc(doc(db(SHIP_OWNER), 'outbox/task-1')));
    await assertFails(getDoc(doc(db(CAR_DRIVER), 'outbox/task-1')));
  });

  it('the requester reads back their own sendTestInvoiceEmail task', async () => {
    await assertSucceeds(getDoc(doc(db(SHIP_OWNER), 'outbox/test-email-1')));
  });

  it("no one else reads another actor's sendTestInvoiceEmail task", async () => {
    await assertFails(getDoc(doc(db(CAR_DRIVER), 'outbox/test-email-1')));
    await assertFails(getDoc(doc(db(OUTSIDER), 'outbox/test-email-1')));
  });

  it('no client can enqueue, tamper with, or forge outbox work — not even their own test-email task', async () => {
    await assertFails(setDoc(doc(db(SHIP_OWNER), 'outbox/task-x'), { type: 'enrichLoadRoute', status: 'pending' }));
    await assertFails(
      setDoc(doc(db(SHIP_OWNER), 'outbox/test-email-1'), { type: 'sendTestInvoiceEmail', status: 'done', actorId: SHIP_OWNER })
    );
  });
});

describe('invites (the link is the secret)', () => {
  it('lets a signed-in user read the one invite they can name', async () => {
    // Knowing the id IS the credential — that is what makes the link work.
    await assertSucceeds(getDoc(doc(db(OUTSIDER), 'invites/inv-1')));
  });

  it('never lets anyone enumerate them, which would harvest every unspent link', async () => {
    await assertFails(getDocs(collection(db(OUTSIDER), 'invites')));
    await assertFails(getDocs(collection(db(SHIP_OWNER), 'invites')));
  });

  it('lets the founder list them, to manage what they have sent', async () => {
    await assertSucceeds(getDocs(collection(founderDb(), 'invites')));
  });

  it('does not take a lookalike address for the founder', async () => {
    await assertFails(getDocs(collection(founderDb('nvwebdevelopers@gmail.com.attacker.test'), 'invites')));
    await assertFails(getDocs(collection(founderDb('notnvwebdevelopers@gmail.com'), 'invites')));
  });

  it('refuses a signed-out reader outright', async () => {
    await assertFails(getDoc(doc(db(null), 'invites/inv-1')));
  });

  it('denies every client write — minting and spending go through dispatch', async () => {
    await assertFails(setDoc(doc(db(OUTSIDER), 'invites/inv-2'), { inviteId: 'inv-2', status: 'pending' }));
    // Above all: nobody may un-spend an invite to reuse the link.
    await assertFails(setDoc(doc(db(OUTSIDER), 'invites/inv-1'), { status: 'pending' }));
    await assertFails(setDoc(doc(founderDb(), 'invites/inv-1'), { status: 'pending' }));
  });
});

describe('deny-by-default', () => {
  it('an unknown collection is denied read and write', async () => {
    await assertFails(getDoc(doc(db(SHIP_OWNER), 'secrets/s1')));
    await assertFails(setDoc(doc(db(SHIP_OWNER), 'secrets/s1'), { x: 1 }));
  });
});
