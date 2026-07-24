import { describe, expect, it } from 'vitest';
import type { GeoPoint } from '@mbh/domain';
import { InMemoryGeocoder, InMemoryRouteProvider } from '@mbh/provider-mocks';
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
  overrides: Partial<Pick<DrainDeps, 'geocoder' | 'routeProvider'>> = {}
): DrainDeps {
  let n = 0;
  return {
    store: harness.store,
    geocoder:
      overrides.geocoder ??
      new InMemoryGeocoder({ [ORIGIN_PC]: TRAFFORD, [DEST_PC]: LEITH }),
    routeProvider: overrides.routeProvider ?? new InMemoryRouteProvider(),
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

  it('is a no-op once the task is done (nothing left pending)', async () => {
    const harness = await makeHarness();
    await seedLoad(harness);
    await runDrainOnce(drainDeps(harness));

    const summary = await runDrainOnce(drainDeps(harness));
    expect(summary).toEqual({ reclaimed: 0, enriched: 0, retried: 0, failed: 0, skipped: 0 });
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
