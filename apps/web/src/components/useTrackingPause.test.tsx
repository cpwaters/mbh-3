import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MotionFix } from '@mbh/domain';
import type { DriverJobView } from '@mbh/provider-interfaces';
import { useTrackingPause } from './useTrackingPause';

const job = {
  jobId: 'job-1',
  carrierTenantId: 'carrier-1',
  status: 'in_transit',
  origin: { line1: '1 A Road', town: 'Trafford', postcode: 'M17 1WS' },
  destination: { line1: '2 B Road', town: 'Leith', postcode: 'EH6 6JJ' },
  priceGbpPence: 68_000,
} as DriverJobView;

const fix = (overrides: Partial<MotionFix> = {}): MotionFix => ({
  lat: 53.4,
  lng: -2.29,
  at: '2026-08-01T10:00:00.000Z',
  speedMps: null,
  ...overrides,
});

function sentTypes(enqueue: ReturnType<typeof vi.fn>): { type: string; paused: boolean }[] {
  return enqueue.mock.calls.map((c) => ({
    type: c[0] as string,
    paused: (c[1] as { paused: boolean }).paused,
  }));
}

describe('useTrackingPause', () => {
  it('starts unpaused and records a pause when the driver asks for one', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useTrackingPause(job, null, enqueue));

    expect(result.current.paused).toBe(false);
    await act(async () => result.current.toggle());

    expect(result.current.paused).toBe(true);
    expect(sentTypes(enqueue)).toEqual([{ type: 'setJobTracking', paused: true }]);
  });

  it('resumes by itself once the load is clearly moving', async () => {
    // The reason the pause is safe to offer at all: a driver pauses at the
    // services and forgets, and without this the trail has an unexplained
    // hole from there to the delivery.
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ f }: { f: MotionFix | null }) => useTrackingPause(job, f, enqueue), {
      initialProps: { f: null as MotionFix | null },
    });

    await act(async () => result.current.toggle());
    expect(result.current.paused).toBe(true);

    await act(async () => {
      rerender({ f: fix({ speedMps: 25 }) });
    });

    expect(result.current.paused).toBe(false);
    expect(sentTypes(enqueue)).toEqual([
      { type: 'setJobTracking', paused: true },
      { type: 'setJobTracking', paused: false },
    ]);
  });

  it('is not switched back on by GPS drift while parked', async () => {
    // Resuming behind the driver's back on noise would make the pause worth
    // nothing. Only a confident reading counts.
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ f }: { f: MotionFix | null }) => useTrackingPause(job, f, enqueue), {
      initialProps: { f: null as MotionFix | null },
    });

    await act(async () => result.current.toggle());
    await act(async () => {
      rerender({ f: fix({ speedMps: 0.3 }) }); // well under walking pace
    });

    expect(result.current.paused).toBe(true);
    expect(sentTypes(enqueue)).toEqual([{ type: 'setJobTracking', paused: true }]);
  });

  it('does not resume on a fix it cannot read a speed from', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ f }: { f: MotionFix | null }) => useTrackingPause(job, f, enqueue), {
      initialProps: { f: null as MotionFix | null },
    });

    await act(async () => result.current.toggle());
    await act(async () => {
      rerender({ f: fix() }); // no reading, no previous fix to derive from
    });

    expect(result.current.paused).toBe(true);
  });

  it('a new job never inherits the last one’s pause', async () => {
    const enqueue = vi.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ j }: { j: DriverJobView }) => useTrackingPause(j, null, enqueue), {
      initialProps: { j: job },
    });

    await act(async () => result.current.toggle());
    expect(result.current.paused).toBe(true);

    await act(async () => {
      rerender({ j: { ...job, jobId: 'job-2' } });
    });

    expect(result.current.paused).toBe(false);
  });
});
