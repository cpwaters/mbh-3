import { z } from 'zod';
import type { Listing, Load, OutboxTask } from '@mbh/domain';
import { listingDoc, listingsCollection, loadDoc, outboxTaskDoc } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireFounder } from '../require-founder.js';
import { zodParse } from '../parse.js';

// A repair tool, run once from the back office: puts the loads already on the
// board onto drivers' maps. Listings only carry a collection point from the
// drain run that enriches them, so ones enriched before that existed have
// none. For each listing without one:
//   - its load was enriched → copy the point across;
//   - its load never was (its enrichment failed, or never ran) → queue a
//     fresh enrichment, which places it on the next drain run if the
//     postcode can be found this time.
// Safe to re-run: a placed listing no longer matches, and a re-queued load is
// only queued again if it is still unplaced.
const placeListingsSchema = z.object({});

export type PlaceListingsPayload = z.infer<typeof placeListingsSchema>;

export interface PlaceListingsResult extends DocData {
  placed: number;
  requeued: number;
}

export const placeListingsHandler: ActionHandler<PlaceListingsPayload, PlaceListingsResult> = {
  type: 'placeListings',
  idempotent: true,
  parse: zodParse(placeListingsSchema),
  async execute(tx, ctx) {
    requireFounder(ctx);

    const listings = (await tx.query({ collection: listingsCollection() })).map(
      (row) => row.data as unknown as Listing
    );
    const unplaced = listings.filter((l) => l.collectionPoint === undefined);
    // Reads before writes: every load first.
    const loads = await Promise.all(unplaced.map(async (l) => (await tx.get(loadDoc(l.loadId))) as unknown as Load | null));

    let placed = 0;
    let requeued = 0;
    unplaced.forEach((listing, i) => {
      const load = loads[i];
      if (load === null || load === undefined) return;
      if (load.route !== undefined) {
        tx.write({
          kind: 'update',
          path: listingDoc(listing.loadId),
          data: {
            collectionPoint: { lat: load.route.origin.lat, lng: load.route.origin.lng },
            route: { distanceMeters: load.route.distanceMeters, durationSeconds: load.route.durationSeconds },
          },
        });
        placed += 1;
        return;
      }
      const taskId = ctx.newId('task');
      const task: OutboxTask = {
        taskId,
        type: 'enrichLoadRoute',
        status: 'pending',
        tenantId: load.tenantId,
        loadId: load.loadId,
        attempts: 0,
        createdAt: ctx.now,
      };
      tx.write({ kind: 'create', path: outboxTaskDoc(taskId), data: { ...task } });
      requeued += 1;
    });

    return { result: { placed, requeued }, auditDetail: { placed, requeued } };
  },
};
