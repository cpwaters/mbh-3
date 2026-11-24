import { describe, expect, it } from 'vitest';
import { AppError, FOUNDER_EMAIL } from '@mbh/domain';
import { makeHarness } from './test-harness.js';

const founder = { actorId: 'founder-1', email: FOUNDER_EMAIL };

const listing = (loadId: string, extra: Record<string, unknown> = {}) => ({
  kind: 'create' as const,
  path: `listings/${loadId}`,
  data: { loadId, shipperTenantId: 'shipper-1', origin: { town: 'T', postcode: 'M17 1WS' }, ...extra },
});
const load = (loadId: string, extra: Record<string, unknown> = {}) => ({
  kind: 'create' as const,
  path: `loads/${loadId}`,
  data: { loadId, tenantId: 'shipper-1', status: 'available', ...extra },
});
const ROUTE = {
  origin: { lat: 53.47, lng: -2.33 },
  destination: { lat: 55.98, lng: -3.17 },
  distanceMeters: 352_000,
  durationSeconds: 14_400,
  enrichedAt: '2026-08-01T09:00:00.000Z',
};

describe('placeListings — putting the existing board on the map', () => {
  it('copies the collection point onto listings whose load was enriched, and re-queues the rest', async () => {
    const h = await makeHarness();
    await h.store.runBatch([
      listing('enriched'),
      load('enriched', { route: ROUTE }),
      listing('never-enriched'),
      load('never-enriched'),
      listing('already', { collectionPoint: { lat: 1, lng: 1 } }),
      load('already', { route: ROUTE }),
    ]);

    const result = await h.run(founder, { type: 'placeListings', payload: {}, requestId: 'r-1' });

    expect(result).toEqual({ placed: 1, requeued: 1 });
    expect(await h.store.getDoc('listings/enriched')).toMatchObject({ collectionPoint: { lat: 53.47, lng: -2.33 } });
    // One already placed is left exactly as it was.
    expect(await h.store.getDoc('listings/already')).toMatchObject({ collectionPoint: { lat: 1, lng: 1 } });
    const tasks = await h.store.query({ collection: 'outbox', filters: [{ field: 'loadId', op: '==', value: 'never-enriched' }] });
    expect(tasks.map((t) => t.data)).toEqual([expect.objectContaining({ type: 'enrichLoadRoute', status: 'pending' })]);
  });

  it('finds nothing to do on a second run once everything enriched is placed', async () => {
    const h = await makeHarness();
    await h.store.runBatch([listing('enriched'), load('enriched', { route: ROUTE })]);
    await h.run(founder, { type: 'placeListings', payload: {}, requestId: 'r-1' });
    expect(await h.run(founder, { type: 'placeListings', payload: {}, requestId: 'r-2' })).toEqual({ placed: 0, requeued: 0 });
  });

  it('is the founder’s alone', async () => {
    const h = await makeHarness();
    await expect(h.run('ship-owner', { type: 'placeListings', payload: {}, requestId: 'r-1' })).rejects.toBeInstanceOf(
      AppError
    );
  });
});
