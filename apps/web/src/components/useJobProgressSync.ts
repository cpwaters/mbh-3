import { useEffect, useRef } from 'react';
import { genRequestId } from '@mbh/client';
import type { DriverJobView } from '@mbh/provider-interfaces';
import { dispatchAction } from '../lib/dispatch';

// GPS progress drives the job's REAL status through its legal state machine
// (accepted → collected → in_transit). Without this the driver app never
// advanced a job past 'accepted', so deliverJob was always an illegal
// transition the server rejected — which is why delivery records sat in
// "Waiting to send" forever and never reached Firestore. By the time the
// driver hits the 95% delivery gate the job is already in_transit, so the
// delivery commits.
//
// Percent-of-journey thresholds at which each transition fires. Modest, so a
// driver who has clearly departed is 'collected' and one underway is
// 'in_transit' well before arrival. Both actions are idempotent and the server
// guards the transition, so re-firing is harmless.
const COLLECT_AT = 3;
const TRANSIT_AT = 10;

export function useJobProgressSync(
  job: DriverJobView | null,
  progress: number | null,
  getIdToken: () => Promise<string | null>,
  reloadJob: () => void
): void {
  const inFlight = useRef(false);

  useEffect(() => {
    if (job === null || progress === null || inFlight.current) return;

    const next =
      job.status === 'accepted' && progress >= COLLECT_AT
        ? 'collectJob'
        : job.status === 'collected' && progress >= TRANSIT_AT
          ? 'startTransit'
          : null;
    if (next === null) return;

    inFlight.current = true;
    void (async () => {
      try {
        const res = await dispatchAction(
          getIdToken,
          next,
          { carrierTenantId: job.carrierTenantId, jobId: job.jobId },
          genRequestId()
        );
        // On success, reload the job so the next threshold can advance it; a
        // failure (e.g. offline) just leaves the status to be retried on the
        // next position fix.
        if (res.ok) reloadJob();
      } finally {
        inFlight.current = false;
      }
    })();
  }, [job, progress, getIdToken, reloadJob]);
}
