import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useDeviceLocation } from './useDeviceLocation';

// jsdom has no real Geolocation/Permissions implementation — stub both so we
// can drive the exact sequences that matter: permission already granted at
// mount (the returning-user case) vs. a fresh explicit request. Each test
// redefines both (configurable: true) rather than relying on cleanup, since
// RTL's own afterEach(cleanup) unmounts (and calls navigator.geolocation.
// clearWatch in the effect teardown) at an unpredictable point relative to a
// same-file afterEach that would delete the stub out from under it.
function stubGeolocation(): {
  watchPosition: ReturnType<typeof vi.fn>;
  clearWatch: ReturnType<typeof vi.fn>;
} {
  const watchPosition = vi.fn().mockReturnValue(1);
  const clearWatch = vi.fn();
  Object.defineProperty(window.navigator, 'geolocation', {
    configurable: true,
    value: { watchPosition, clearWatch },
  });
  return { watchPosition, clearWatch };
}

function stubPermissions(state: 'granted' | 'none'): void {
  Object.defineProperty(window.navigator, 'permissions', {
    configurable: true,
    value: state === 'granted' ? { query: vi.fn().mockResolvedValue({ state: 'granted' }) } : undefined,
  });
}

describe('useDeviceLocation — the "Enable location" click-does-nothing bug', () => {
  it('auto-resumes a watch on mount when permission was already granted, without a click', async () => {
    const { watchPosition } = stubGeolocation();
    stubPermissions('granted');

    const { result } = renderHook(() => useDeviceLocation());

    await waitFor(() => expect(result.current.watching).toBe(true));
    expect(watchPosition).toHaveBeenCalledTimes(1);
    // No fix has landed yet — `tracking` (has a fix) must stay false even
    // though a watch is already open.
    expect(result.current.tracking).toBe(false);
  });

  it('a manual requestLocation() call while already watching does not re-invoke watchPosition (the no-op the UI must not hide behind a dead button)', async () => {
    const { watchPosition } = stubGeolocation();
    stubPermissions('granted');

    const { result } = renderHook(() => useDeviceLocation());
    await waitFor(() => expect(result.current.watching).toBe(true));

    act(() => result.current.requestLocation());

    expect(watchPosition).toHaveBeenCalledTimes(1); // still just the one from auto-resume
    expect(result.current.tracking).toBe(false);
    expect(result.current.watching).toBe(true);
  });

  // Regression for a second bug this same fix could have introduced: an
  // existing button (Active Jobs' "View Route") already calls
  // requestLocation() proactively, before permission has ever been decided.
  // That call must NOT flip `watching` — if it did, a still-pending native
  // permission prompt (or, in headless test automation, a request that never
  // resolves at all — see e2e's denyGeolocation() comment) would look
  // identical to "already confirmed granted", and callers like MapView's
  // consent modal would wrongly skip themselves while permission is still
  // genuinely undecided.
  it('a fresh requestLocation() call (no prior confirmed grant) invokes watchPosition but does NOT flip watching', () => {
    const { watchPosition } = stubGeolocation();
    stubPermissions('none'); // nothing auto-resumes

    const { result } = renderHook(() => useDeviceLocation());

    expect(result.current.watching).toBe(false);
    act(() => result.current.requestLocation());

    expect(watchPosition).toHaveBeenCalledTimes(1); // the request really was made
    expect(result.current.watching).toBe(false); // but not yet confirmed granted
  });

  it('clears `watching` when a previously-granted watch reports permission denied', async () => {
    const { watchPosition } = stubGeolocation();
    stubPermissions('granted');

    const { result } = renderHook(() => useDeviceLocation());
    await waitFor(() => expect(result.current.watching).toBe(true));

    const errorCallback = watchPosition.mock.calls[0]?.[1] as (err: GeolocationPositionError) => void;
    act(() =>
      errorCallback({ code: 1, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError)
    );

    expect(result.current.watching).toBe(false);
    expect(result.current.tracking).toBe(false);
    expect(result.current.error).toMatch(/denied/i);
  });
});
