import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as logger from 'firebase-functions/logger';
import { runDrainOnce } from '@mbh/actions';
import { getDrainDeps } from './composition.js';

// The scheduled drain: the ONLY place third-party delivery happens (never in a
// user request). Every minute it walks pending outbound work, claims each item
// with a status CAS, calls the provider (geocode + route), and records the
// outcome as a system-sourced action in the same transaction as its evidence.
// It is a thin adapter — the fully-tested logic is runDrainOnce in @mbh/actions.
//
// SMTP auth (for the invoice email — see composition.ts) is read as a plain
// env var, NOT firebase-functions' defineSecret()/Secret Manager — see the
// comment on composition.ts's smtpUserEnv for why: merely calling
// defineSecret() anywhere in the bundle makes deploy resolve it against
// Secret Manager for every function, so a not-yet-provisioned secret broke
// the entire deploy (functions+hosting+firestore, one command) even after
// removing it from this function's own `secrets: [...]`. Migrating to real
// Secret Manager is tracked in docs/HANDOFF.md.
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
