import { useEffect, useMemo, useRef, useState } from 'react';
import type { Listing } from '@mbh/domain';
import { lookupPostcode, type GeoPoint } from '../lib/geocode';
import { haversineMeters } from '../lib/progress';

export interface RankedListing {
  listing: Listing;
  // Straight-line metres from the driver to this load's pickup, or null until
  // the pickup postcode is geocoded / while location is unavailable.
  distanceMeters: number | null;
  // Where the pickup postcode is, once located — what the map pins.
  pickup: GeoPoint | null;
}

// Ranks the available loads by how close their PICKUP is to a point — the
// driver's live GPS position, or a place they chose — nearest first,
// re-ranking as it moves and as polling brings new loads in.
//
// Where a pickup is: the collection point the server put on the listing when
// it enriched the load. Only a listing without one (not enriched yet) is
// looked up here, by postcode, once per postcode. A lookup that failed (no
// signal) is not remembered, so the next poll tries again rather than leaving
// the load off the map for the rest of the session.
export function useNearbyListings(listings: Listing[], driverLocation: GeoPoint | null): RankedListing[] {
  const cacheRef = useRef<Map<string, GeoPoint | null>>(new Map());
  const [resolved, setResolved] = useState(0); // bumps when new geocodes land

  useEffect(() => {
    let cancelled = false;
    const pending = Array.from(
      new Set(
        listings
          .filter((l) => l.collectionPoint === undefined)
          .map((l) => l.origin.postcode.trim())
          .filter((pc) => pc.length > 0 && !cacheRef.current.has(pc))
      )
    );
    if (pending.length === 0) return;
    Promise.all(
      pending.map(async (pc) => {
        const point = await lookupPostcode(pc);
        if (point !== 'unavailable') cacheRef.current.set(pc, point);
      })
    ).then(() => {
      if (!cancelled) setResolved((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [listings]);

  return useMemo(() => {
    const ranked: RankedListing[] = listings.map((listing) => {
      const pickup = listing.collectionPoint ?? cacheRef.current.get(listing.origin.postcode.trim()) ?? null;
      const distanceMeters =
        driverLocation !== null && pickup !== null ? haversineMeters(driverLocation, pickup) : null;
      return { listing, distanceMeters, pickup };
    });
    // Nearest first; unknown distances (no fix yet / un-geocoded) sink to the
    // bottom keeping their original newest-first order.
    return ranked
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        const da = a.r.distanceMeters;
        const db = b.r.distanceMeters;
        if (da === null && db === null) return a.i - b.i;
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db || a.i - b.i;
      })
      .map((x) => x.r);
    // `resolved` is a dep so a landed geocode triggers a re-rank.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listings, driverLocation, resolved]);
}
