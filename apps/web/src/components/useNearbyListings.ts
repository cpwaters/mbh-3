import { useEffect, useMemo, useRef, useState } from 'react';
import type { Listing } from '@mbh/domain';
import { geocodePostcode, type GeoPoint } from '../lib/geocode';
import { haversineMeters } from '../lib/progress';

export interface RankedListing {
  listing: Listing;
  // Straight-line metres from the driver to this load's pickup, or null until
  // the pickup postcode is geocoded / while location is unavailable.
  distanceMeters: number | null;
}

// Ranks the available loads by how close their PICKUP is to the driver's live
// GPS position — nearest first — re-ranking as the driver moves and as polling
// brings new loads in, without a page refresh. Listings carry no coordinates,
// so pickups are geocoded from their postcode once and cached; a re-sort or a
// poll never re-geocodes a postcode already seen.
export function useNearbyListings(listings: Listing[], driverLocation: GeoPoint | null): RankedListing[] {
  const cacheRef = useRef<Map<string, GeoPoint | null>>(new Map());
  const [resolved, setResolved] = useState(0); // bumps when new geocodes land

  useEffect(() => {
    let cancelled = false;
    const pending = Array.from(
      new Set(
        listings
          .map((l) => l.origin.postcode.trim())
          .filter((pc) => pc.length > 0 && !cacheRef.current.has(pc))
      )
    );
    if (pending.length === 0) return;
    Promise.all(
      pending.map(async (pc) => {
        cacheRef.current.set(pc, await geocodePostcode(pc));
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
      const pickup = cacheRef.current.get(listing.origin.postcode.trim()) ?? null;
      const distanceMeters =
        driverLocation !== null && pickup !== null ? haversineMeters(driverLocation, pickup) : null;
      return { listing, distanceMeters };
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
