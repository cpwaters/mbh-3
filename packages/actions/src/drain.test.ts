import { describe, expect, it } from 'vitest';
import type { GeoPoint } from '@mbh/domain';
import { InMemoryGeocoder, InMemoryMailer, InMemoryObjectStorage, InMemoryRouteProvider } from '@mbh/provider-mocks';
import { runDrainOnce, type DrainDeps } from './drain.js';
import { makeHarness, validPostLoadPayload, type Harness } from './test-harness.js';

// Postcodes from validPostLoadPayload.
const ORIGIN_PC = 'M17 1WS';
const DEST_PC = 'EH6 6JJ';
const TRAFFORD: GeoPoint = { lat: 53.4673, lng: -2.2915 };
const LEITH: GeoPoint = { lat: 55.9758, lng: -3.1706 };

async function seedLoad(harness: Harness): Promise<void> {
  await harness.run('ship-owner', {
    type: 'postLoad',
    payload: validPostLoadPayload(),
    requestId: 'r-post-1',
  });
}

function drainDeps(
  harness: Harness,
  overrides: Partial<Pick<DrainDeps, 'geocoder' | 'routeProvider' | 'mailer' | 'objectStorage'>> = {}
): DrainDeps {
  let n = 0;
  return {
    store: harness.store,
    geocoder:
      overrides.geocoder ??
      new InMemoryGeocoder({ [ORIGIN_PC]: TRAFFORD, [DEST_PC]: LEITH }),
    routeProvider: overrides.routeProvider ?? new InMemoryRouteProvider(),
    mailer: overrides.mailer ?? new InMemoryMailer(),
    objectStorage: overrides.objectStorage ?? new InMemoryObjectStorage(),
    now: () => '2026-08-01T10:00:00.000Z',
    // Distinct from the harness's ids so the system audit never collides.
    newId: (prefix: string) => `${prefix}-drain-${++n}`,
  };
}

describe('runDrainOnce — enrichLoadRoute', () => {
  it('geocodes + routes a posted load and records the outcome as a system action', async () => {
    const harness = await makeHarness();
    await seedLoad(harness);

    const summary = await runDrainOnce(drainDeps(harness));
    expect(summary).toMatchObject({ enriched: 1, failed: 0, retried: 0, skipped: 0 });

    const load = await harness.store.getDoc('loads/load-1');
    expect(load?.route).toMatchObject({
      origin: TRAFFORD,
      destination: LEITH,
      enrichedAt: '2026-08-01T10:00:00.000Z',
    });
    expect((load?.route as { distanceMeters: number }).distanceMeters).toBeGreaterThan(0);

    const task = await harness.store.getDoc('outbox/task-1');
    expect(task?.status).toBe('done');

    // The carrier listing mirrors the computed route.
    const listing = await harness.store.getDoc('listings/load-1');
    expect((listing?.route as { distanceMeters: number }).distanceMeters).toBeGreaterThan(0);

    const audits = await harness.store.query({
      collection: 'audit',
      filters: [{ field: 'source', op: '==', value: 'system' }],
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.data).toMatchObject({ action: 'enrichLoadRoute', actorId: 'system', loadId: 'load-1' });
  });

  it('backfills the route onto a job accepted before enrichment finished (the accept-vs-drain race)', async () => {
    const harness = await makeHarness();
    await seedLoad(harness);

    // Accept immediately — before the drain has had a chance to run. This is
    // exactly the reported bug: acceptLoad only denormalizes load.route onto
    // the job if the load was ALREADY enriched by acceptance time, and
    // nothing else ever revisits the job — so without this backfill, a job
    // accepted inside the drain's ~1-minute window never shows a route.
    const { jobId } = (await harness.run('driver-1', {
      type: 'acceptLoad',
      payload: { carrierTenantId: 'carrier-1', loadId: 'load-1' },
      requestId: 'r-accept-race',
    })) as { jobId: string };
    expect(await harness.store.getDoc(`jobs/${jobId}`).then((j) => j?.route)).toBeUndefined();

    const summary = await runDrainOnce(drainDeps(harness));
    expect(summary).toMatchObject({ enriched: 1 });

    const job = await harness.store.getDoc(`jobs/${jobId}`);
    expect(job?.route).toMatchObject({ origin: TRAFFORD, destination: LEITH });
    expect((job?.route as { distanceMeters: number }).distanceMeters).toBeGreaterThan(0);
  });

  it('leaves an already-routed job alone (does not clobber it on a later re-enrichment)', async () => {
    const harness = await makeHarness();
    await seedLoad(harness);
    await runDrainOnce(drainDeps(harness)); // enriches the load before acceptance this time

    const { jobId } = (await harness.run('driver-1', {
      type: 'acceptLoad',
      payload: { carrierTenantId: 'carrier-1', loadId: 'load-1' },
      requestId: 'r-accept-normal',
    })) as { jobId: string };
    const jobBefore = await harness.store.getDoc(`jobs/${jobId}`);
    expect(jobBefore?.route).toBeDefined(); // denormalized at acceptance, as normal

    // Nothing left pending, so this run is a no-op — the job's route is
    // untouched (not that this scenario currently re-triggers enrichment,
    // but the backfill's own guard is the thing under test here).
    await runDrainOnce(drainDeps(harness));
    const jobAfter = await harness.store.getDoc(`jobs/${jobId}`);
    expect(jobAfter?.route).toEqual(jobBefore?.route);
  });

  it('is a no-op once the task is done (nothing left pending)', async () => {
    const harness = await makeHarness();
    await seedLoad(harness);
    await runDrainOnce(drainDeps(harness));

    const summary = await runDrainOnce(drainDeps(harness));
    expect(summary).toEqual({ reclaimed: 0, enriched: 0, invoiced: 0, retried: 0, failed: 0, skipped: 0 });
  });

  it('fails permanently when a postcode is unknown', async () => {
    const harness = await makeHarness();
    await seedLoad(harness);

    // Only the origin resolves; destination is unknown.
    const geocoder = new InMemoryGeocoder({ [ORIGIN_PC]: TRAFFORD });
    const summary = await runDrainOnce(drainDeps(harness, { geocoder }));
    expect(summary).toMatchObject({ failed: 1, enriched: 0 });

    const task = await harness.store.getDoc('outbox/task-1');
    expect(task?.status).toBe('failed');
    expect(task?.lastError).toBe('postcode not found');
    expect(await harness.store.getDoc('loads/load-1').then((l) => l?.route)).toBeUndefined();
  });

  it('retries a recoverable provider failure, then enriches on the next run', async () => {
    const harness = await makeHarness();
    await seedLoad(harness);

    const geocoder = new InMemoryGeocoder({ [ORIGIN_PC]: TRAFFORD, [DEST_PC]: LEITH }).failOnce();

    const first = await runDrainOnce(drainDeps(harness, { geocoder }));
    expect(first).toMatchObject({ retried: 1, enriched: 0 });
    const afterFirst = await harness.store.getDoc('outbox/task-1');
    expect(afterFirst?.status).toBe('pending');
    expect(afterFirst?.attempts).toBe(1);

    const second = await runDrainOnce(drainDeps(harness, { geocoder }));
    expect(second).toMatchObject({ enriched: 1 });
    expect(await harness.store.getDoc('outbox/task-1').then((t) => t?.status)).toBe('done');
  });

  it('reclaims a stale claimed task', async () => {
    const harness = await makeHarness();
    await seedLoad(harness);
    // Simulate a crashed run: claimed 10 minutes ago.
    await harness.store.runBatch([
      {
        kind: 'update',
        path: 'outbox/task-1',
        data: { status: 'claimed', claimedAt: '2026-08-01T09:50:00.000Z' },
      },
    ]);

    const summary = await runDrainOnce(drainDeps(harness)); // now = 10:00, 10 min later
    // Reclaimed to pending, then processed in the same run.
    expect(summary.reclaimed).toBe(1);
    expect(summary.enriched).toBe(1);
    expect(await harness.store.getDoc('outbox/task-1').then((t) => t?.status)).toBe('done');
  });
});

async function seedShipperBillingProfile(harness: Harness, overrides: Record<string, unknown> = {}): Promise<void> {
  await harness.store.runBatch([
    { kind: 'create', path: 'userProfiles/ship-owner', data: { actorId: 'ship-owner', email: 'billing@acme.test', ...overrides } },
  ]);
}

// Drives a fresh load all the way to 'delivered' for driver-1 — the trigger
// for the sendInvoiceEmail outbox task.
async function deliveredJob(
  harness: Harness,
  evidence: { photoRefs?: string[]; signatureRef?: string } = {}
): Promise<string> {
  const { loadId } = (await harness.run('ship-owner', {
    type: 'postLoad',
    payload: validPostLoadPayload(),
    requestId: `post-${Math.random()}`,
  })) as { loadId: string };
  const { jobId } = (await harness.run('driver-1', {
    type: 'acceptLoad',
    payload: { carrierTenantId: 'carrier-1', loadId },
    requestId: `accept-${Math.random()}`,
  })) as { jobId: string };
  await harness.run('driver-1', {
    type: 'collectJob',
    payload: { carrierTenantId: 'carrier-1', jobId },
    requestId: `c-${jobId}`,
  });
  await harness.run('driver-1', {
    type: 'startTransit',
    payload: { carrierTenantId: 'carrier-1', jobId },
    requestId: `t-${jobId}`,
  });
  await harness.run('driver-1', {
    type: 'deliverJob',
    payload: {
      carrierTenantId: 'carrier-1',
      jobId,
      photoRefs: evidence.photoRefs ?? ['storage://pod/photo-1.jpg'],
      signatureRef: evidence.signatureRef ?? 'storage://pod/sig-1.png',
      recipientName: 'J. Smith',
    },
    requestId: `deliver-${jobId}`,
  });
  return jobId;
}

describe('runDrainOnce — sendInvoiceEmail', () => {
  it('sends the invoice once the job is delivered, and records the outcome', async () => {
    const harness = await makeHarness();
    await seedShipperBillingProfile(harness);
    const jobId = await deliveredJob(harness);

    const mailer = new InMemoryMailer();
    const summary = await runDrainOnce(drainDeps(harness, { mailer }));
    expect(summary).toMatchObject({ invoiced: 1, failed: 0, retried: 0 });

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      jobId,
      invoiceNumber: `INV-${jobId.toUpperCase()}`,
      carrierCompanyName: 'Waters Haulage',
      shipperCompanyName: 'Acme',
      recipientEmail: 'billing@acme.test',
      totalGbpPence: 68_000,
    });

    const events = await harness.store.query({ collection: `jobs/${jobId}/events` });
    expect(events.some((e) => e.data.type === 'job.invoiceSent')).toBe(true);

    const audits = await harness.store.query({
      collection: 'audit',
      filters: [{ field: 'action', op: '==', value: 'sendInvoiceEmail' }],
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.data).toMatchObject({ jobId, actorId: 'system', source: 'system' });
  });

  it('includes the carrier VAT number when the carrier owner has one on file', async () => {
    const harness = await makeHarness();
    await seedShipperBillingProfile(harness);
    await harness.store.runBatch([
      { kind: 'create', path: 'userProfiles/car-owner', data: { actorId: 'car-owner', vatNumber: 'GB123456789' } },
    ]);
    await deliveredJob(harness);

    const mailer = new InMemoryMailer();
    await runDrainOnce(drainDeps(harness, { mailer }));

    expect(mailer.sent[0]).toMatchObject({ carrierVatNumber: 'GB123456789' });
  });

  it('fails permanently when the shipper has no billing profile on file', async () => {
    const harness = await makeHarness();
    // No userProfiles/ship-owner seeded — nowhere to send the invoice.
    await deliveredJob(harness);

    const mailer = new InMemoryMailer();
    const summary = await runDrainOnce(drainDeps(harness, { mailer }));
    expect(summary).toMatchObject({ invoiced: 0, failed: 1 });
    expect(mailer.sent).toHaveLength(0);

    const tasks = await harness.store.query({
      collection: 'outbox',
      filters: [{ field: 'type', op: '==', value: 'sendInvoiceEmail' }],
    });
    expect(tasks[0]?.data).toMatchObject({
      status: 'failed',
      lastError: 'no billing email on file for the shipper',
    });
  });

  it('retries a recoverable mailer failure, then sends on the next run', async () => {
    const harness = await makeHarness();
    await seedShipperBillingProfile(harness);
    await deliveredJob(harness);

    const mailer = new InMemoryMailer().failOnce();
    const first = await runDrainOnce(drainDeps(harness, { mailer }));
    expect(first).toMatchObject({ retried: 1, invoiced: 0 });

    const second = await runDrainOnce(drainDeps(harness, { mailer }));
    expect(second).toMatchObject({ invoiced: 1 });
    expect(mailer.sent).toHaveLength(1);
  });

  it('attaches the signature (inline data URL) and resolvable photos, and includes recipientName', async () => {
    const harness = await makeHarness();
    await seedShipperBillingProfile(harness);
    const objectStorage = new InMemoryObjectStorage();
    const photoRef = 'pod/job-1/req-1/0.jpg';
    await objectStorage.upload(photoRef, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }), 'image/jpeg');

    await deliveredJob(harness, { photoRefs: [photoRef], signatureRef: 'data:image/png;base64,c2ln' });

    const mailer = new InMemoryMailer();
    const summary = await runDrainOnce(drainDeps(harness, { mailer, objectStorage }));
    expect(summary).toMatchObject({ invoiced: 1, failed: 0 });

    expect(mailer.sent[0]).toMatchObject({ recipientName: 'J. Smith' });
    const attachments = mailer.sentAttachments[0]!;
    expect(attachments).toHaveLength(2);
    expect(attachments.find((a) => a.filename === 'signature.png')).toMatchObject({ contentType: 'image/png' });
    expect(attachments.find((a) => a.filename === 'delivery-photo-1.jpg')).toMatchObject({
      contentType: 'image/jpeg',
    });
  });

  it('still sends when a photo ref cannot be resolved (a legacy placeholder), keeping the signature', async () => {
    const harness = await makeHarness();
    await seedShipperBillingProfile(harness);
    const objectStorage = new InMemoryObjectStorage(); // nothing uploaded — every ref is unresolvable

    await deliveredJob(harness, {
      photoRefs: ['capture://legacy-name:1024'],
      signatureRef: 'data:image/png;base64,c2ln',
    });

    const mailer = new InMemoryMailer();
    const summary = await runDrainOnce(drainDeps(harness, { mailer, objectStorage }));
    expect(summary).toMatchObject({ invoiced: 1, failed: 0 });

    const attachments = mailer.sentAttachments[0]!;
    expect(attachments).toHaveLength(1);
    expect(attachments[0]).toMatchObject({ filename: 'signature.png' });
  });
});

describe('runDrainOnce — sendTestInvoiceEmail', () => {
  it('sends synthetic invoice content to the recipient captured on the task, and records the outcome', async () => {
    const harness = await makeHarness();
    await harness.store.runBatch([
      { kind: 'create', path: 'userProfiles/ship-owner', data: { actorId: 'ship-owner', email: 'founder@mybackhaul.test' } },
    ]);
    await harness.run('ship-owner', {
      type: 'sendTestInvoiceEmail',
      payload: { tenantId: 'shipper-1' },
      requestId: 'r-test-1',
    });

    const mailer = new InMemoryMailer();
    const summary = await runDrainOnce(drainDeps(harness, { mailer }));
    expect(summary).toMatchObject({ invoiced: 1, failed: 0, retried: 0 });

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]).toMatchObject({
      jobId: 'TEST',
      recipientEmail: 'founder@mybackhaul.test',
      carrierCompanyName: 'Test Carrier Ltd',
      shipperCompanyName: 'Test Shipper Ltd',
    });
    expect(mailer.sent[0]?.invoiceNumber.startsWith('TEST-')).toBe(true);

    const task = await harness.store.getDoc('outbox/task-1');
    expect(task?.status).toBe('done');

    // Two audit entries share the action name 'sendTestInvoiceEmail' by
    // design: one from the client dispatch that enqueued the task, one from
    // the drain completing it — distinguished by source, not action.
    const audits = await harness.store.query({
      collection: 'audit',
      filters: [
        { field: 'action', op: '==', value: 'sendTestInvoiceEmail' },
        { field: 'source', op: '==', value: 'system' },
      ],
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.data).toMatchObject({ actorId: 'system', source: 'system', recipientEmail: 'founder@mybackhaul.test' });

    // No job exists for a test send, so there's no JobEvent to check —
    // just confirming the drain didn't try to write one.
    expect(await harness.store.getDoc('jobs/job-1')).toBeNull();
  });

  it('retries a recoverable mailer failure, then sends on the next run', async () => {
    const harness = await makeHarness();
    await harness.store.runBatch([
      { kind: 'create', path: 'userProfiles/ship-owner', data: { actorId: 'ship-owner', email: 'founder@mybackhaul.test' } },
    ]);
    await harness.run('ship-owner', {
      type: 'sendTestInvoiceEmail',
      payload: { tenantId: 'shipper-1' },
      requestId: 'r-test-2',
    });

    const mailer = new InMemoryMailer().failOnce();
    const first = await runDrainOnce(drainDeps(harness, { mailer }));
    expect(first).toMatchObject({ retried: 1, invoiced: 0 });

    const second = await runDrainOnce(drainDeps(harness, { mailer }));
    expect(second).toMatchObject({ invoiced: 1 });
    expect(mailer.sent).toHaveLength(1);
  });
});
