import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { runDrainOnce } from '@mbh/actions';
import { getDrainDeps } from './composition.js';

// The scheduled drain: the ONLY place third-party delivery happens (never in a
// user request). Every minute it walks pending outbound work, claims each item
// with a status CAS, calls the provider (geocode + route), and records the
// outcome as a system-sourced action in the same transaction as its evidence.
// It is a thin adapter — the fully-tested logic is runDrainOnce in @mbh/actions.
export const drain = onSchedule(
  {
    region: 'europe-west2',
    schedule: 'every 1 minutes',
    timeZone: 'Europe/London',
    // One run at a time: a run that overshoots a minute must not overlap the
    // next. The claim CAS already makes concurrency safe; this keeps it simple.
    maxInstances: 1,
  },
  async () => {
    const summary = await runDrainOnce(getDrainDeps());
    if (summary.enriched + summary.failed + summary.retried + summary.reclaimed > 0) {
      logger.info('drain processed outbound work', summary);
    }
  }
);
