// Walking skeleton, now through the real Action Layer: authenticate an
// actor from a token, then dispatch postLoad + acceptLoad. Proves the spine
// end-to-end (auth → validate → authorize → effect + audit + marker) with
// zero cloud dependencies. Run: pnpm seed

import { authenticateActor } from '@mbh/auth';
import { buildRegistry, dispatch, type DispatchDeps } from '@mbh/actions';
import { formatGbp } from '@mbh/domain';
import { InMemoryDataStore, MockAuthProvider } from '@mbh/provider-mocks';

function makeIdGen(): (prefix: string) => string {
  const counters = new Map<string, number>();
  return (prefix) => {
    const n = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, n);
    return `${prefix}-${n}`;
  };
}

async function main(): Promise<void> {
  const store = new InMemoryDataStore();
  const auth = new MockAuthProvider();
  const registry = buildRegistry();
  const deps: DispatchDeps = { store, now: new Date().toISOString(), newId: makeIdGen() };

  // Tenants + members (the composition root would provision these via an
  // onboarding action; here we seed them directly to focus on the spine).
  await store.runBatch([
    { kind: 'create', path: 'tenants/shipper-1', data: { tenantId: 'shipper-1', name: 'Acme Distribution Ltd', capabilities: ['shipper'] } },
    { kind: 'create', path: 'tenants/carrier-1', data: { tenantId: 'carrier-1', name: 'Waters Haulage', capabilities: ['carrier'] } },
    { kind: 'create', path: 'tenants/shipper-1/members/ship-owner', data: { tenantId: 'shipper-1', actorId: 'ship-owner', role: 'owner', status: 'active', displayName: 'Acme Owner' } },
    { kind: 'create', path: 'tenants/carrier-1/members/driver-1', data: { tenantId: 'carrier-1', actorId: 'driver-1', role: 'driver', status: 'active', displayName: 'Chris Waters' } },
  ]);
  auth.grant('ship-owner-token', 'ship-owner');
  auth.grant('driver-token', 'driver-1');

  // Shipper posts a load.
  const shipper = await authenticateActor(auth, 'ship-owner-token');
  const posted = (await dispatch(deps, registry, shipper, {
    type: 'postLoad',
    requestId: 'seed-post-1',
    payload: {
      shipperTenantId: 'shipper-1',
      origin: { line1: '10 Distribution Way', town: 'Trafford', postcode: 'M17 1WS' },
      destination: { line1: '5 Harbour Road', town: 'Leith', postcode: 'EH6 6JJ' },
      consignment: { description: 'Mixed palletised goods', weightKg: 14200, palletCount: 16 },
      priceGbpPence: 68_000,
      pickupBy: '2026-08-02',
      deliverBy: '2026-08-03',
    },
  })) as { loadId: string };

  // Driver accepts it.
  const driver = await authenticateActor(auth, 'driver-token');
  const accepted = (await dispatch(deps, registry, driver, {
    type: 'acceptLoad',
    requestId: 'seed-accept-1',
    payload: { carrierTenantId: 'carrier-1', loadId: posted.loadId },
  })) as { jobId: string };

  // Idempotent replay returns the original job, no second effect.
  const replay = (await dispatch(deps, registry, driver, {
    type: 'acceptLoad',
    requestId: 'seed-accept-1',
    payload: { carrierTenantId: 'carrier-1', loadId: posted.loadId },
  })) as { jobId: string };
  if (replay.jobId !== accepted.jobId) throw new Error('idempotent replay returned a different job');

  // Walk the job lifecycle: collect -> in transit -> deliver (the atomic
  // legal event: PoD evidence + status + event in one batch).
  const carrier = { carrierTenantId: 'carrier-1', jobId: accepted.jobId };
  await dispatch(deps, registry, driver, { type: 'collectJob', requestId: 'seed-collect', payload: carrier });
  await dispatch(deps, registry, driver, { type: 'startTransit', requestId: 'seed-transit', payload: carrier });
  const delivered = (await dispatch(deps, registry, driver, {
    type: 'deliverJob',
    requestId: 'seed-deliver',
    payload: {
      ...carrier,
      photoRefs: ['storage://pod/photo-1.jpg'],
      signatureRef: 'storage://pod/signature-1.png',
      recipientName: 'Warehouse Supervisor',
      location: { lat: 55.98, lng: -3.17 },
    },
  })) as { jobId: string; evidenceId: string };

  const load = await store.getDoc(`loads/${posted.loadId}`);
  const job = await store.getDoc(`jobs/${accepted.jobId}`);
  const events = await store.query({ collection: `jobs/${accepted.jobId}/events` });
  const evidence = await store.getDoc(`jobs/${accepted.jobId}/evidence/${delivered.evidenceId}`);
  const audit = await store.query({ collection: 'audit' });

  console.log('Walking skeleton (through the Action Layer): OK');
  console.log(`  load ${posted.loadId}: ${String(load?.status)} (${formatGbp(68_000)})`);
  console.log(`  job ${accepted.jobId}: ${String(job?.status)} — driver ${driver}`);
  console.log(`  job events: ${events.map((e) => String(e.data.type)).join(' -> ')}`);
  console.log(`  proof of delivery: ${String(evidence?.recipientName)} signed (${delivered.evidenceId})`);
  console.log(`  audit entries: ${audit.map((a) => String(a.data.action)).join(', ')}`);
  console.log(`  idempotent replay returned the original job (${replay.jobId})`);
}

main().catch((err) => {
  console.error('Walking skeleton FAILED:', err);
  process.exit(1);
});
