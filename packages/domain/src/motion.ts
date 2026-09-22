// Is the load moving, or has it stopped?
//
// Pure: fixes in, a state out. No browser, no clock of its own — so the
// thresholds and the hysteresis are testable without a device, which matters
// because the failure modes here are all about borderline speeds.

export type MotionState = 'moving' | 'stopped';

export interface MotionFix {
  lat: number;
  lng: number;
  at: string; // ISO-8601 UTC
  // Metres per second, straight from the device when it can measure it.
  // Null is common and not exceptional — a WiFi- or cell-derived fix carries
  // no Doppler, so the speed has to be inferred from the previous position.
  speedMps: number | null;
}

// Walking pace would be the wrong line to draw. A truck crawling in a queue
// at 3mph is below it and unambiguously working, and treating that as stopped
// means going quiet exactly when a shipper most wants to know why their load
// has not moved. So the two thresholds are deliberately far apart, and a
// vehicle between them keeps whatever state it already had.
export const MOVING_ABOVE_MPS = 2.2; // ~5mph — unambiguously under way
export const STOPPED_BELOW_MPS = 0.45; // ~1mph — unambiguously not

// A stop is only a stop once it has lasted. Traffic lights, roundabouts and
// a queue for the barrier are not events a shipper wants to hear about.
export const STOPPED_AFTER_MS = 3 * 60 * 1000;

// Above this, a "speed" derived from two fixes is not believable — a GPS
// jump between a cell-tower fix and a satellite one can imply hundreds of
// mph. Discard rather than let it flip the state.
const MAX_BELIEVABLE_MPS = 60; // ~134mph

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const R = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// The device's own reading when it has one, otherwise distance over time.
// Returns null when neither is available or believable, which callers treat
// as "no information" rather than as zero — a missing reading is not a stop.
export function fixSpeedMps(fix: MotionFix, previous: MotionFix | null): number | null {
  if (fix.speedMps !== null && Number.isFinite(fix.speedMps) && fix.speedMps >= 0) {
    return fix.speedMps;
  }
  if (previous === null) return null;
  const seconds = (Date.parse(fix.at) - Date.parse(previous.at)) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const derived = haversineMeters(previous, fix) / seconds;
  if (!Number.isFinite(derived) || derived > MAX_BELIEVABLE_MPS) return null;
  return derived;
}

export interface MotionTracker {
  state: MotionState;
  // When the current run of below-threshold readings began — the moment a
  // confirmed stop is dated from, not the moment it was confirmed.
  slowSince: string | null;
  previous: MotionFix | null;
}

export function initialMotion(): MotionTracker {
  // Assumed moving: a job under way that has not yet produced two fixes
  // should not be announced as stopped.
  return { state: 'moving', slowSince: null, previous: null };
}

export interface MotionUpdate {
  tracker: MotionTracker;
  // Set only on the fix that changes the state, so a caller can record the
  // transition and ignore everything in between.
  transition: MotionState | null;
  // When the stop began, on the fix that confirms one.
  stoppedSince: string | null;
}

export function advanceMotion(tracker: MotionTracker, fix: MotionFix): MotionUpdate {
  const speed = fixSpeedMps(fix, tracker.previous);
  const next: MotionTracker = { ...tracker, previous: fix };

  // No believable reading: hold the current state. Silence is not a stop.
  if (speed === null) {
    return { tracker: next, transition: null, stoppedSince: null };
  }

  if (speed > MOVING_ABOVE_MPS) {
    next.slowSince = null;
    if (tracker.state === 'stopped') {
      next.state = 'moving';
      return { tracker: next, transition: 'moving', stoppedSince: null };
    }
    return { tracker: next, transition: null, stoppedSince: null };
  }

  if (speed < STOPPED_BELOW_MPS) {
    // Date the stop from when it started, not from when we became sure.
    next.slowSince = tracker.slowSince ?? fix.at;
    const slowFor = Date.parse(fix.at) - Date.parse(next.slowSince);
    if (tracker.state === 'moving' && Number.isFinite(slowFor) && slowFor >= STOPPED_AFTER_MS) {
      next.state = 'stopped';
      return { tracker: next, transition: 'stopped', stoppedSince: next.slowSince };
    }
    return { tracker: next, transition: null, stoppedSince: null };
  }

  // Between the two thresholds: crawling. Keep the current state, and keep
  // any slow run going so a crawl that decays into a stop still counts.
  return { tracker: next, transition: null, stoppedSince: null };
}
