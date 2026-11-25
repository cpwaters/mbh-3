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
// It also gives listings made before vehicle requirements were carried across
// the size and type their load asks for.
// Safe to re-run: a placed, described listing no longer matches, and a
// re-queued load is only queued again if it is still unplaced.
const placeListingsSchema = z.object({});

export type PlaceListingsPayload = z.infer<typeof placeListingsSchema>;

export interface PlaceListingsResult extends DocData {
  placed: number;
  requeued: number;
  // Listings given the vehicle requirements they were made without.
  described: number;
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
    const unplaced = (l: Listing) => l.collectionPoint === undefined;
    // Listings made before vehicle requirements were carried across.
    const undescribed = (l: Listing) => l.vehicleSizes === undefined || l.vehicleTypes === undefined;
    const stale = listings.filter((l) => unplaced(l) || undescribed(l));
    // Every read before any write: a transaction needs it that way round.
    const loads = await Promise.all(stale.map(async (l) => (await tx.get(loadDoc(l.loadId))) as unknown as Load | null));

    let placed = 0;
    let requeued = 0;
    let described = 0;
    stale.forEach((listing, i) => {
      const load = loads[i];
      if (load === null || load === undefined) return;
      const update: Record<string, unknown> = {};
      if (undescribed(listing)) {
        update.vehicleSizes = [...(load.postingDetails?.vehicleSizes ?? [])];
        update.vehicleTypes = [...(load.postingDetails?.vehicleTypes ?? [])];
        described += 1;
      }
      if (unplaced(listing)) {
        if (load.route !== undefined) {
          update.collectionPoint = { lat: load.route.origin.lat, lng: load.route.origin.lng };
          update.route = { distanceMeters: load.route.distanceMeters, durationSeconds: load.route.durationSeconds };
          placed += 1;
        } else {
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
        }
      }
      if (Object.keys(update).length > 0) {
        tx.write({ kind: 'update', path: listingDoc(listing.loadId), data: update as DocData });
      }
    });

    return { result: { placed, requeued, described }, auditDetail: { placed, requeued, described } };
  },
};
