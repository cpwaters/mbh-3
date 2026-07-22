// Walking-skeleton seed: proves the spine — domain entities + DataStore
// contract + atomic claim — with zero cloud dependencies. Run: pnpm seed
//
// This intentionally composes writes by hand; once the Action Layer exists
// (bootstrap step 3) the same flow becomes acceptLoad and this script
// switches to dispatching actions instead.

import {
  ACTIVE_JOB_STATUSES,
  canTransitionLoad,
  formatGbp,
  isValidLoadPriceGbpPence,
  type Job,
  type Load,
  type LoadStatus,
  type Member,
  type Tenant,
} from '@mbh/domain';
import { InMemoryDataStore } from '@mbh/provider-mocks';

const now = new Date().toISOString();

const shipper: Tenant = {
  tenantId: 'shipper-1',
  name: 'Acme Distribution Ltd',
  capabilities: ['shipper'],
  createdAt: now,
};

const carrier: Tenant = {
  tenantId: 'carrier-1',
  name: 'Waters Haulage',
  capabilities: ['carrier'],
  createdAt: now,
};

const driver: Member = {
  tenantId: carrier.tenantId,
  actorId: 'driver-1',
  displayName: 'Chris Waters',
  role: 'driver',
  status: 'active',
  createdAt: now,
};

const load: Load = {
  loadId: 'load-1',
  tenantId: shipper.tenantId,
  status: 'available',
  origin: { line1: '10 Distribution Way', town: 'Trafford', postcode: 'M17 1WS' },
  destination: { line1: '5 Harbour Road', town: 'Leith', postcode: 'EH6 6JJ' },
  consignment: { description: 'Mixed palletised goods', weightKg: 14200, palletCount: 16 },
  priceGbpPence: 68_000,
  pickupBy: '2026-08-01',
  deliverBy: '2026-08-02',
  createdAt: now,
};

async function main(): Promise<void> {
  if (!isValidLoadPriceGbpPence(load.priceGbpPence)) {
    throw new Error('seed load violates the money invariant');
  }

  const store = new InMemoryDataStore();

  await store.runBatch([
    { kind: 'create', path: `tenants/${shipper.tenantId}`, data: { ...shipper } },
    { kind: 'create', path: `tenants/${carrier.tenantId}`, data: { ...carrier } },
    {
      kind: 'create',
      path: `tenants/${carrier.tenantId}/members/${driver.actorId}`,
      data: { ...driver },
    },
    { kind: 'create', path: `loads/${load.loadId}`, data: { ...load } },
  ]);

  // The acceptance: a transaction that CAS-claims the load and creates the
  // cross-tenant Job + its first append-only event atomically — the same
  // shape the real acceptLoad action will have.
  const jobId = 'job-1';
  const accepted = await store.runTransaction(async (tx) => {
    const current = await tx.get(`loads/${load.loadId}`);
    if (current === null) return false;
    const status = current.status as LoadStatus;
    if (status !== 'available' || !canTransitionLoad(status, 'matched')) return false;

    // One-active-job-per-driver: refuse if the driver already has one.
    const activeJobs = await store.query({
      collection: 'jobs',
      filters: [{ field: 'driverActorId', op: '==', value: driver.actorId }],
    });
    const hasActive = activeJobs.some((j) =>
      (ACTIVE_JOB_STATUSES as readonly string[]).includes(j.data.status as string)
    );
    if (hasActive) return false;

    const job: Job = {
      jobId,
      loadId: load.loadId,
      shipperTenantId: shipper.tenantId,
      carrierTenantId: carrier.tenantId,
      driverActorId: driver.actorId,
      status: 'accepted',
      createdAt: new Date().toISOString(),
    };

    tx.write({ kind: 'update', path: `loads/${load.loadId}`, data: { status: 'matched' } });
    tx.write({ kind: 'create', path: `jobs/${jobId}`, data: { ...job } });
    tx.write({
      kind: 'create',
      path: `jobs/${jobId}/events/evt-1`,
      data: {
        eventId: 'evt-1',
        jobId,
        type: 'job.accepted',
        at: job.createdAt,
        actorId: driver.actorId,
        source: 'member',
      },
    });
    return true;
  });

  if (!accepted) throw new Error('walking skeleton failed: load was not claimable');

  // A second acceptance attempt must observe the CAS and refuse.
  const secondAttempt = await store.runTransaction(async (tx) => {
    const current = await tx.get(`loads/${load.loadId}`);
    return current !== null && current.status === 'available';
  });
  if (secondAttempt) throw new Error('walking skeleton failed: CAS did not hold');

  const finalLoad = await store.getDoc(`loads/${load.loadId}`);
  const finalJob = await store.getDoc(`jobs/${jobId}`);
  const events = await store.query({ collection: `jobs/${jobId}/events` });

  console.log('Walking skeleton: OK');
  console.log(`  load ${load.loadId}: ${String(finalLoad?.status)} (${formatGbp(load.priceGbpPence)})`);
  console.log(`  job ${jobId}: ${String(finalJob?.status)} — driver ${driver.displayName}`);
  console.log(`  events: ${events.map((e) => String(e.data.type)).join(', ')}`);
  console.log('  second claim correctly refused (CAS held)');
}

main().catch((err) => {
  console.error('Walking skeleton FAILED:', err);
  process.exit(1);
});
