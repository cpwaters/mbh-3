import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { JobTrail } from '@mbh/provider-interfaces';
import { TrailStatus, isStale, lastSeenLabel, pausedForLabel, stoppedForLabel } from './LoadTrail';

const NOW = Date.parse('2026-08-01T12:00:00.000Z');
const ago = (ms: number): string => new Date(NOW - ms).toISOString();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function trailWith(
  lastSeenAt: string | null,
  pointCount = 3,
  stoppedSince: string | null = null,
  pausedSince: string | null = null
): JobTrail {
  return {
    jobId: 'job-1',
    status: 'in_transit',
    points: Array.from({ length: pointCount }, (_, i) => ({
      lat: 53 + i * 0.1,
      lng: -2,
      at: ago((pointCount - i) * MINUTE),
    })),
    pausedSince,
    stoppedSince,
    lastSeenAt,
  };
}

describe('lastSeenLabel', () => {
  it('reads in the units a person would use', () => {
    expect(lastSeenLabel(ago(30_000), NOW)).toBe('Last seen just now');
    expect(lastSeenLabel(ago(MINUTE), NOW)).toBe('Last seen 1 minute ago');
    expect(lastSeenLabel(ago(7 * MINUTE), NOW)).toBe('Last seen 7 minutes ago');
    expect(lastSeenLabel(ago(HOUR), NOW)).toBe('Last seen 1 hour ago');
    expect(lastSeenLabel(ago(5 * HOUR), NOW)).toBe('Last seen 5 hours ago');
    expect(lastSeenLabel(ago(50 * HOUR), NOW)).toBe('Last seen 2 days ago');
  });

  it('says so plainly when nothing has been recorded', () => {
    expect(lastSeenLabel(null, NOW)).toBe('No position recorded yet');
    expect(lastSeenLabel('not a date', NOW)).toBe('No position recorded yet');
  });
});

describe('isStale', () => {
  it('treats a recent fix as current and an old one as not', () => {
    expect(isStale(ago(5 * MINUTE), NOW)).toBe(false);
    expect(isStale(ago(25 * MINUTE), NOW)).toBe(true);
  });

  it('treats no fix, and an unparseable one, as stale', () => {
    expect(isStale(null, NOW)).toBe(true);
    expect(isStale('nonsense', NOW)).toBe(true);
  });
});

describe('stoppedForLabel', () => {
  it('reads in the units a person would use', () => {
    expect(stoppedForLabel(ago(30_000), NOW)).toBe('Stopped');
    expect(stoppedForLabel(ago(MINUTE), NOW)).toBe('Stopped for 1 minute');
    expect(stoppedForLabel(ago(42 * MINUTE), NOW)).toBe('Stopped for 42 minutes');
    expect(stoppedForLabel(ago(2 * HOUR), NOW)).toBe('Stopped for 2 hours');
    expect(stoppedForLabel(ago(2 * HOUR + 15 * MINUTE), NOW)).toBe('Stopped for 2h 15m');
    expect(stoppedForLabel(ago(30 * HOUR), NOW)).toBe('Stopped for 1 day');
  });
});

describe('pausedForLabel', () => {
  it('reads as a decision someone made, with when they made it', () => {
    expect(pausedForLabel(ago(30_000), NOW)).toBe('Driver paused tracking');
    expect(pausedForLabel(ago(MINUTE), NOW)).toBe('Driver paused tracking 1 minute ago');
    expect(pausedForLabel(ago(25 * MINUTE), NOW)).toBe('Driver paused tracking 25 minutes ago');
    expect(pausedForLabel(ago(3 * HOUR), NOW)).toBe('Driver paused tracking 3 hours ago');
  });
});

describe('TrailStatus', () => {
  const noop = (): void => {};

  it('never claims a position is live — only when it was last seen', () => {
    render(<TrailStatus trail={trailWith(ago(2 * MINUTE))} loading={false} error={null} now={NOW} onRefresh={noop} />);
    expect(screen.getByText(/last seen 2 minutes ago/i)).toBeInTheDocument();
    expect(screen.queryByText(/\blive\b/i)).not.toBeInTheDocument();
  });

  it('warns that an old fix is where the load WAS', () => {
    // The failure this guards: a shipper reads a stale dot as current and
    // promises their own customer a delivery time on the strength of it.
    render(<TrailStatus trail={trailWith(ago(45 * MINUTE))} loading={false} error={null} now={NOW} onRefresh={noop} />);
    expect(screen.getByText(/where the load was, not necessarily where it is now/i)).toBeInTheDocument();
  });

  it('explains an empty trail rather than showing an empty map with no comment', () => {
    render(<TrailStatus trail={trailWith(null, 0)} loading={false} error={null} now={NOW} onRefresh={noop} />);
    expect(screen.getByText(/no position recorded yet/i)).toBeInTheDocument();
    expect(screen.getByText(/tracking starts once they collect/i)).toBeInTheDocument();
  });

  it('says when no carrier has the load yet', () => {
    render(<TrailStatus trail={null} loading={false} error={null} now={NOW} onRefresh={noop} />);
    expect(screen.getByText(/no carrier has accepted this load yet/i)).toBeInTheDocument();
  });

  it('keeps showing the trail when a refresh fails, and says so', () => {
    render(
      <TrailStatus
        trail={trailWith(ago(3 * MINUTE))}
        loading={false}
        error="Could not refresh the location just now."
        now={NOW}
        onRefresh={noop}
      />
    );
    expect(screen.getByText(/last seen 3 minutes ago/i)).toBeInTheDocument();
    expect(screen.getByText(/could not refresh/i)).toBeInTheDocument();
  });

  it('states a stop instead of leaving the shipper to infer it from silence', () => {
    // The breadcrumb trigger is distance-based, so a parked vehicle produces
    // no points at all. Without this, a stop looks exactly like a driver who
    // closed the app.
    render(
      <TrailStatus
        trail={trailWith(ago(40 * MINUTE), 3, ago(40 * MINUTE))}
        loading={false}
        error={null}
        now={NOW}
        onRefresh={noop}
      />
    );
    expect(screen.getByText(/stopped for 40 minutes/i)).toBeInTheDocument();
    // ...and does not also nag that the position is stale: the stop explains it.
    expect(screen.queryByText(/not necessarily where it is now/i)).not.toBeInTheDocument();
  });

  it('goes back to last-seen once the load is moving again', () => {
    render(
      <TrailStatus trail={trailWith(ago(2 * MINUTE), 3, null)} loading={false} error={null} now={NOW} onRefresh={noop} />
    );
    expect(screen.queryByText(/stopped for/i)).not.toBeInTheDocument();
    expect(screen.getByText(/last seen 2 minutes ago/i)).toBeInTheDocument();
  });

  it('names a pause as the driver’s choice, not as a fault', () => {
    render(
      <TrailStatus
        trail={trailWith(ago(30 * MINUTE), 3, null, ago(30 * MINUTE))}
        loading={false}
        error={null}
        now={NOW}
        onRefresh={noop}
      />
    );
    expect(screen.getByText(/driver paused tracking 30 minutes ago/i)).toBeInTheDocument();
    // And says it ends by itself, so nobody rings the driver to ask.
    expect(screen.getByText(/resumes when the load is moving again/i)).toBeInTheDocument();
  });

  it('a pause takes precedence over calling the load stopped', () => {
    // A paused tracker reports no movement either way, so "stopped" would be
    // an inference we have not earned.
    render(
      <TrailStatus
        trail={trailWith(ago(30 * MINUTE), 3, ago(30 * MINUTE), ago(30 * MINUTE))}
        loading={false}
        error={null}
        now={NOW}
        onRefresh={noop}
      />
    );
    expect(screen.getByText(/driver paused tracking/i)).toBeInTheDocument();
    expect(screen.queryByText(/stopped for/i)).not.toBeInTheDocument();
  });

  it('can be refreshed by hand', async () => {
    const user = userEvent.setup();
    const onRefresh = vi.fn();
    render(<TrailStatus trail={trailWith(ago(MINUTE))} loading={false} error={null} now={NOW} onRefresh={onRefresh} />);

    await user.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
