import { describe, expect, it } from 'vitest';
import {
  MOVING_ABOVE_MPS,
  STOPPED_AFTER_MS,
  STOPPED_BELOW_MPS,
  advanceMotion,
  fixSpeedMps,
  initialMotion,
  type MotionFix,
  type MotionTracker,
} from './motion.js';

const T0 = Date.parse('2026-08-01T10:00:00.000Z');
const at = (ms: number): string => new Date(T0 + ms).toISOString();
const MINUTE = 60_000;

function fix(overrides: Partial<MotionFix> & { at: string }): MotionFix {
  return { lat: 53.4, lng: -2.29, speedMps: null, ...overrides };
}

// Drive a whole sequence through, returning every transition it produced.
function run(fixes: MotionFix[]): { transitions: { to: string; since: string | null }[]; tracker: MotionTracker } {
  let tracker = initialMotion();
  const transitions: { to: string; since: string | null }[] = [];
  for (const f of fixes) {
    const update = advanceMotion(tracker, f);
    tracker = update.tracker;
    if (update.transition !== null) transitions.push({ to: update.transition, since: update.stoppedSince });
  }
  return { transitions, tracker };
}

describe('fixSpeedMps', () => {
  it('prefers the device’s own reading', () => {
    expect(fixSpeedMps(fix({ at: at(0), speedMps: 20 }), null)).toBe(20);
  });

  it('derives from the previous position when the device gives none', () => {
    // ~111m north in 10s ≈ 11 m/s.
    const previous = fix({ at: at(0), lat: 53.0, lng: -2 });
    const current = fix({ at: at(10_000), lat: 53.001, lng: -2 });
    const speed = fixSpeedMps(current, previous);
    expect(speed).toBeGreaterThan(10);
    expect(speed).toBeLessThan(12);
  });

  it('has no answer from a single fix with no reading', () => {
    // Not zero — "no information" must not read as "stopped".
    expect(fixSpeedMps(fix({ at: at(0) }), null)).toBeNull();
  });

  it('discards an implausible jump rather than believing it', () => {
    // A cell-tower fix followed by a satellite one can imply hundreds of mph.
    const previous = fix({ at: at(0), lat: 53.0, lng: -2 });
    const current = fix({ at: at(1000), lat: 54.0, lng: -2 });
    expect(fixSpeedMps(current, previous)).toBeNull();
  });
});

describe('advanceMotion', () => {
  it('does not call a load stopped at a traffic light', () => {
    // Stationary, but only for a minute — below STOPPED_AFTER_MS.
    const { transitions } = run([
      fix({ at: at(0), speedMps: 25 }),
      fix({ at: at(MINUTE), speedMps: 0 }),
      fix({ at: at(2 * MINUTE), speedMps: 25 }),
    ]);
    expect(transitions).toEqual([]);
  });

  it('calls a stop once it has lasted, and dates it from when it began', () => {
    const { transitions } = run([
      fix({ at: at(0), speedMps: 25 }),
      fix({ at: at(MINUTE), speedMps: 0 }), // slow run starts here
      fix({ at: at(2 * MINUTE), speedMps: 0 }),
      fix({ at: at(MINUTE + STOPPED_AFTER_MS), speedMps: 0 }), // confirmed
    ]);
    expect(transitions).toEqual([{ to: 'stopped', since: at(MINUTE) }]);
  });

  it('resumes as soon as it is clearly moving again', () => {
    const { transitions } = run([
      fix({ at: at(0), speedMps: 25 }),
      fix({ at: at(MINUTE), speedMps: 0 }),
      fix({ at: at(MINUTE + STOPPED_AFTER_MS), speedMps: 0 }),
      fix({ at: at(MINUTE + STOPPED_AFTER_MS + MINUTE), speedMps: 25 }),
    ]);
    expect(transitions.map((t) => t.to)).toEqual(['stopped', 'moving']);
  });

  it('keeps a crawling truck "moving" — the whole reason for two thresholds', () => {
    // ~3mph in a queue: below walking pace, unambiguously working. A single
    // threshold at walking speed would go silent here, which is exactly when
    // a shipper most wants to know why their load has not moved.
    const crawl = (MOVING_ABOVE_MPS + STOPPED_BELOW_MPS) / 2;
    expect(crawl).toBeGreaterThan(STOPPED_BELOW_MPS);
    expect(crawl).toBeLessThan(MOVING_ABOVE_MPS);

    const { transitions, tracker } = run([
      fix({ at: at(0), speedMps: 25 }),
      ...Array.from({ length: 20 }, (_, i) => fix({ at: at((i + 1) * MINUTE), speedMps: crawl })),
    ]);
    expect(transitions).toEqual([]);
    expect(tracker.state).toBe('moving');
  });

  it('holds its state through fixes whose speed is not believable', () => {
    // GPS jumping between cell-tower and satellite fixes derives absurd
    // speeds. Those are no information, and no information is not a stop.
    const { transitions, tracker } = run([
      fix({ at: at(0), speedMps: 25 }),
      fix({ at: at(1000), lat: 55.0, lng: -3 }),
      fix({ at: at(2000), lat: 51.0, lng: -1 }),
      fix({ at: at(3000), lat: 55.0, lng: -3 }),
    ]);
    expect(transitions).toEqual([]);
    expect(tracker.state).toBe('moving');
  });

  it('a genuinely parked vehicle IS a stop, even with no speed reading', () => {
    // The other side of the same coin: identical positions over time derive
    // ~0 m/s honestly, and that should be reported.
    const { transitions } = run([
      fix({ at: at(0), speedMps: 25 }),
      fix({ at: at(MINUTE), lat: 53.4, lng: -2.29 }),
      fix({ at: at(2 * MINUTE), lat: 53.4, lng: -2.29 }),
      fix({ at: at(MINUTE + STOPPED_AFTER_MS), lat: 53.4, lng: -2.29 }),
    ]);
    expect(transitions.map((t) => t.to)).toEqual(['stopped']);
  });

  it('starts out assuming the load is moving', () => {
    expect(initialMotion().state).toBe('moving');
  });
});
