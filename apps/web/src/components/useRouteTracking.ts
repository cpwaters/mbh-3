import { useEffect, useRef } from 'react';
import { genRequestId } from '@mbh/client';
import type { DriverJobView } from '@mbh/provider-interfaces';
import type { GeoPoint } from '../lib/geocode';
import { haversineMeters } from '../lib/progress';

const MILE_METERS = 1609.344;

// Breadcrumbs the laden journey (collected -> delivered) at roughly one-mile
// intervals, enqueued through the SAME offline sync queue a delivery capture
// uses — recordRoutePoint is idempotent and offline-retriable, so a point
// recorded in a signal-dead yard or motorway cutting is delayed, not lost.
// Distance is measured from the last RECORDED point (not total distance
// travelled), so it's a straight-line proxy for "roughly a mile since last
// time," not true path-integrated odometry — fine for a breadcrumb trail.
export function useRouteTracking(
  job: DriverJobView | null,
  location: GeoPoint | null,
  enqueue: (type: string, payload: unknown, requestId: string) => Promise<void>
): void {
  const trackedJobIdRef = useRef<string | null>(null);
  const lastPointRef = useRef<GeoPoint | null>(null);

  useEffect(() => {
    if (job === null || location === null) return;
    if (job.status !== 'collected' && job.status !== 'in_transit') return;

    if (trackedJobIdRef.current !== job.jobId) {
      // A new job (or the first tick for this one) — this fix is the trail's
      // starting point, recorded immediately below.
      trackedJobIdRef.current = job.jobId;
      lastPointRef.current = null;
    }

    const last = lastPointRef.current;
    if (last !== null && haversineMeters(last, location) < MILE_METERS) return;

    lastPointRef.current = location;
    void enqueue(
      'recordRoutePoint',
      { carrierTenantId: job.carrierTenantId, jobId: job.jobId, location },
      genRequestId()
    );
  }, [job, location, enqueue]);
}
