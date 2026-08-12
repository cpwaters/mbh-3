import { describe, expect, it } from 'vitest';
import { AppError } from '@mbh/domain';
import { InMemoryGeocoder, InMemoryMailer, InMemoryObjectStorage, InMemoryRouteProvider } from '@mbh/provider-mocks';
import { runDrainOnce, type DrainDeps } from './drain.js';
import { makeHarness, type Harness } from './test-harness.js';

// A job stuck at 'delivered' with no closeJob task — exactly the state any
// job delivered before the closeJob mechanism existed is left in. Seeded
// directly (not driven through deliverJob) since the whole point is to
// reproduce the pre-existing, task-less state.
async function seedDeliveredJob(h: Harness, jobId: string, overrides: Record<string, unknown> = {}): Promise<void> {
  await h.store.runBatch([
    {
      kind: 'create',
      path: `jobs/${jobId}`,
      data: {
        jobId,
        loadId: `load-${jobId}`,
        shipperTenantId: 'shipper-1',
        carrierTenantId: 'carrier-1',
        driverActorId: 'driver-1',
        status: 'delivered',
        priceGbpPence: 68_000,
        origin: { line1: '10 Distribution Way', town: 'Trafford', postcode: 'M17 1WS' },
        destination: { line1: '5 Harbour Road', town: 'Leith', postcode: 'EH6 6JJ' },
        createdAt: '2026-08-01T09:00:00.000Z',
        deliveredAt: '2026-08-01T09:00:00.000Z',
        ...overrides,
      },
    },
    {
      kind: 'create',
      path: `loads/load-${jobId}`,
      data: {
        loadId: `load-${jobId}`,
        tenantId: 'shipper-1',
        status: 'matched',
        origin: { line1: '10 Distribution Way', town: 'Trafford', postcode: 'M17 1WS' },
        destination: { line1: '5 Harbour Road', town: 'Leith', postcode: 'EH6 6JJ' },
        consignment: { description: 'Mixed pallets', weightKg: 14200, palletCount: 16 },
        priceGbpPence: 68_000,
        pickupBy: '2026-08-02',
        deliverBy: '2026-08-03',
        createdAt: '2026-08-01T09:00:00.000Z',
      },
    },
  ]);
}

function drainDeps(h: Harness): DrainDeps {
  let n = 0;
  return {
    store: h.store,
    geocoder: new InMemoryGeocoder(),
    routeProvider: new InMemoryRouteProvider(),
    mailer: new InMemoryMailer(),
    objectStorage: new InMemoryObjectStorage(),
    now: () => '2026-08-01T10:00:00.000Z',
    newId: (prefix: string) => `${prefix}-backfill-${++n}`,
  };
}

describe('backfillCloseJobs — one-off repair for jobs stuck at delivered', () => {
  it("enqueues a closeJob task for a delivered job on the shipper's own tenant", async () => {
    const h = await makeHarness();
    await seedDeliveredJob(h, 'job-old-1');

    const result = (await h.run('ship-owner', {
      type: 'backfillCloseJobs',
      payload: { tenantId: 'shipper-1' },
      requestId: 'r-backfill-1',
    })) as { jobIds: string[] };

    expect(result.jobIds).toEqual(['job-old-1']);
    const tasks = await h.store.query({
      collection: 'outbox',
      filters: [{ field: 'type', op: '==', value: 'closeJob' }],
    });
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.data).toMatchObject({ status: 'pending', jobId: 'job-old-1', tenantId: 'shipper-1' });
  });

  it("also finds a delivered job on the carrier's own tenant", async () => {
    const h = await makeHarness();
    await seedDeliveredJob(h, 'job-old-2');

    const result = (await h.run('car-owner', {
      type: 'backfillCloseJobs',
      payload: { tenantId: 'carrier-1' },
      requestId: 'r-backfill-2',
    })) as { jobIds: string[] };

    expect(result.jobIds).toEqual(['job-old-2']);
  });

  it('ignores jobs not currently at delivered (already closed, or still in flight)', async () => {
    const h = await makeHarness();
    await seedDeliveredJob(h, 'job-closed', { status: 'closed' });
    await seedDeliveredJob(h, 'job-transit', { status: 'in_transit' });

    const result = (await h.run('ship-owner', {
      type: 'backfillCloseJobs',
      payload: { tenantId: 'shipper-1' },
      requestId: 'r-backfill-3',
    })) as { jobIds: string[] };

    expect(result.jobIds).toEqual([]);
  });

  it('is safe to re-run: a job the drain already closed no longer matches on a second pass', async () => {
    const h = await makeHarness();
    await seedDeliveredJob(h, 'job-old-3');

    await h.run('ship-owner', {
      type: 'backfillCloseJobs',
      payload: { tenantId: 'shipper-1' },
      requestId: 'r-backfill-4a',
    });
    await runDrainOnce(drainDeps(h));
    expect(await h.store.getDoc('jobs/job-old-3')).toMatchObject({ status: 'closed' });

    const second = (await h.run('ship-owner', {
      type: 'backfillCloseJobs',
      payload: { tenantId: 'shipper-1' },
      requestId: 'r-backfill-4b',
    })) as { jobIds: string[] };
    expect(second.jobIds).toEqual([]);
  });

  it('refuses a non-member of the given tenant', async () => {
    const h = await makeHarness();
    await seedDeliveredJob(h, 'job-old-4');

    try {
      await h.run('driver-1', {
        type: 'backfillCloseJobs',
        payload: { tenantId: 'shipper-1' }, // driver-1 belongs to carrier-1, not shipper-1
        requestId: 'r-backfill-5',
      });
      throw new Error('expected a forbidden AppError');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('forbidden');
    }
  });

  it('refuses a driver of the tenant — owner/dispatcher only', async () => {
    const h = await makeHarness();
    await seedDeliveredJob(h, 'job-old-5');

    try {
      await h.run('driver-1', {
        type: 'backfillCloseJobs',
        payload: { tenantId: 'carrier-1' }, // driver-1 IS a member of carrier-1, but as 'driver'
        requestId: 'r-backfill-6',
      });
      throw new Error('expected a forbidden AppError');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('forbidden');
    }
  });
});
