import { onSchedule } from 'firebase-functions/v2/scheduler';

// The scheduled drain: the ONLY place third-party delivery happens (never in
// a user request). On a 1-minute schedule it will walk pending outbound work,
// claim each item with a compare-and-swap (queued -> submitting), call the
// provider with backoff, and record the outcome as a system-sourced action in
// the same batch as its evidence.
//
// There is no outbound work type yet (the first will be marketplace-notify /
// PoD-delivery-to-the-shipper), so this is the claim/backoff/record skeleton,
// deliberately a no-op until that leg exists — with the schedule, region, and
// shape already in place so adding the first leg is a small change.
export const drain = onSchedule(
  { region: 'europe-west2', schedule: 'every 1 minutes' },
  async () => {
    // No pending outbound work types yet.
  }
);
