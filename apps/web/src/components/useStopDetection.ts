import { useEffect, useRef } from 'react';
import { genRequestId } from '@mbh/client';
import { advanceMotion, initialMotion, type MotionFix, type MotionTracker } from '@mbh/domain';
import type { DriverJobView } from '@mbh/provider-interfaces';

// Tells the record when a load has stopped and when it is moving again.
//
// Breadcrumbs are triggered by distance travelled, so a parked vehicle
// produces none at all — which on the shipper's screen is indistinguishable
// from a driver who closed the app or lost signal. The stop itself has to be
// stated, or the trail is ambiguous exactly when it matters.
//
// The decision is the domain's (advanceMotion); this hook only feeds it fixes
// and posts the transitions, through the SAME offline queue the breadcrumbs
// and the delivery capture use — so a stop detected in a signal-dead lorry
// park is delayed, not lost.
export function useStopDetection(
  job: DriverJobView | null,
  fix: MotionFix | null,
  enqueue: (type: string, payload: unknown, requestId: string) => Promise<void>,
  paused = false
): void {
  const trackerRef = useRef<MotionTracker>(initialMotion());
  const trackedJobIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (job === null || fix === null) return;
    if (job.status !== 'collected' && job.status !== 'in_transit') return;
    // Paused: a pause already explains the silence, and reporting "stopped"
    // from a tracker the driver switched off would be a claim we cannot make.
    if (paused) return;

    // A different job starts from scratch, rather than inheriting the last
    // one's state and announcing a stop that belongs to a finished delivery.
    if (trackedJobIdRef.current !== job.jobId) {
      trackedJobIdRef.current = job.jobId;
      trackerRef.current = initialMotion();
    }

    const update = advanceMotion(trackerRef.current, fix);
    trackerRef.current = update.tracker;
    if (update.transition === null) return;

    void enqueue(
      'recordMotion',
      {
        carrierTenantId: job.carrierTenantId,
        jobId: job.jobId,
        moving: update.transition === 'moving',
        location: { lat: fix.lat, lng: fix.lng },
        ...(update.stoppedSince !== null ? { since: update.stoppedSince } : {}),
      },
      genRequestId()
    );
  }, [job, fix, enqueue, paused]);
}
