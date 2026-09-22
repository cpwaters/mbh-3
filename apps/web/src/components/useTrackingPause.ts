import { useCallback, useEffect, useRef, useState } from 'react';
import { genRequestId } from '@mbh/client';
import { MOVING_ABOVE_MPS, fixSpeedMps, type MotionFix } from '@mbh/domain';
import type { DriverJobView } from '@mbh/provider-interfaces';

export interface TrackingPauseView {
  paused: boolean;
  busy: boolean;
  toggle: () => void;
}

// The driver's own switch for location recording, and the thing that turns it
// back on.
//
// Auto-resume is not a convenience, it is what makes the pause safe to offer.
// A driver pauses at the services and forgets; without this the trail has an
// unexplained hole from there to the delivery, at exactly the point a dispute
// would look. Resuming on movement matches what the pause is FOR — being away
// from the cab — so the pause lasts precisely as long as the reason for it.
//
// Note what is paused and what is not. Recording position stops. The job's
// status, its evidence and the delivery capture carry on: the driver is still
// doing the job, they have only asked not to be followed while out of the
// cab. The device keeps taking fixes either way, because progress and the
// delivery gate need them — they are simply not sent anywhere.
export function useTrackingPause(
  job: DriverJobView | null,
  fix: MotionFix | null,
  enqueue: (type: string, payload: unknown, requestId: string) => Promise<void>
): TrackingPauseView {
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState(false);
  const previousFixRef = useRef<MotionFix | null>(null);
  const trackedJobIdRef = useRef<string | null>(null);

  const send = useCallback(
    (nextPaused: boolean) => {
      if (job === null) return;
      setBusy(true);
      void enqueue(
        'setJobTracking',
        { carrierTenantId: job.carrierTenantId, jobId: job.jobId, paused: nextPaused },
        genRequestId()
      ).finally(() => setBusy(false));
    },
    [job, enqueue]
  );

  const toggle = useCallback(() => {
    setPaused((current) => {
      send(!current);
      return !current;
    });
  }, [send]);

  // A new job never inherits the last one's pause.
  useEffect(() => {
    if (job === null) return;
    if (trackedJobIdRef.current !== job.jobId) {
      trackedJobIdRef.current = job.jobId;
      setPaused(false);
      previousFixRef.current = null;
    }
  }, [job]);

  // Moving again ends the pause on its own.
  useEffect(() => {
    if (fix === null) return;
    const previous = previousFixRef.current;
    previousFixRef.current = fix;
    if (!paused || job === null) return;

    const speed = fixSpeedMps(fix, previous);
    // Only a confident reading resumes. GPS drift while parked must not
    // switch the record back on behind the driver's back.
    if (speed === null || speed <= MOVING_ABOVE_MPS) return;

    setPaused(false);
    send(false);
  }, [fix, paused, job, send]);

  return { paused, busy, toggle };
}
