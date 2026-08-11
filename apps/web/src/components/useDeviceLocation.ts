import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '../lib/geocode';

// The device's live GPS position, owned once at the app root and shared through
// context. Progress, the delivery gate and the map all read the same fix, so
// the driver is only ever prompted for location permission once.
export interface DeviceLocationView {
  location: GeoPoint | null;
  tracking: boolean;
  // Permission was CONFIRMED already granted before anything on this page
  // asked for it — i.e. the mount-time auto-resume (a returning user from an
  // earlier session) — so a watch is silently open even though no fix has
  // landed yet. Deliberately NOT set just because requestLocation() was
  // called: a fresh request against 'prompt' permission leaves the decision
  // pending (a real permission dialog, or in test automation a request that
  // never resolves either way) and must still be treated as "nothing
  // confirmed yet", so callers still get the explanatory "Enable location" /
  // consent-modal UI rather than it being silently skipped. Without this
  // distinction, a returning user whose permission was already granted sees
  // an "Enable location" button that looks unclicked forever, and clicking it
  // does nothing (the watch is already open; see the early return in
  // start()).
  watching: boolean;
  error: string | null;
  // Ask for location permission (if not already tracking) and start watching.
  // Wired to the Active Job "View Route" button and the map's consent modal.
  requestLocation: () => void;
}

// Continuous tracking: a fix every time the device's GPS chip reports one
// (typically every 1-5s while moving), not a fixed-interval poll — the
// closest a browser can get to how a native maps app tracks. Note what this
// can't do: a native app also fuses accelerometer/gyroscope dead-reckoning
// between GPS fixes for a smoothly-updating position, which the browser
// Geolocation API has no access to — and no software layer changes what the
// device's GPS chip itself can resolve to (commonly 5-20m under open sky,
// worse under a vehicle roof or between buildings). This is the ceiling of
// what's achievable from a web app; watchPosition is that ceiling.
// Costs real battery — the GPS radio runs continuously for the length of a
// job, a deliberate trade accepted in favour of freshness/accuracy.

// A GPS fix is typically accurate to single-digit/low-tens of metres. A
// reading this coarse is the device falling back to WiFi/cell-tower
// positioning (common right after a cold GPS start, or briefly indoors/under
// cover at a loading bay) — accurate as a position, just not for THIS device's
// location.
const MAX_ACCURACY_METERS = 100;

// A driver must always have SOME position to track against — never leave the
// map blank. So a coarse fix is only held back while we already have a
// decent one AND haven't been stuck for too long; the very first fix ever,
// and anything after a couple of misses in a row, is accepted regardless of
// accuracy rather than risk showing nothing.
const MAX_CONSECUTIVE_COARSE_FIXES = 2;

export function useDeviceLocation(): DeviceLocationView {
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [tracking, setTracking] = useState(false);
  const [watching, setWatching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const hasLocationRef = useRef(false);
  const coarseStreakRef = useRef(0);

  const start = useCallback(() => {
    if (watchIdRef.current !== null) return; // already watching
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location tracking is not supported on this device.');
      return;
    }
    setError(null);
    const id = navigator.geolocation.watchPosition(
      (position) => {
        const isCoarse = position.coords.accuracy > MAX_ACCURACY_METERS;
        if (isCoarse && hasLocationRef.current && coarseStreakRef.current < MAX_CONSECUTIVE_COARSE_FIXES) {
          // Already have a decent fix and this one's a probable WiFi/cell
          // fallback — wait rather than jump to a worse position, but only
          // for a couple of misses; see MAX_CONSECUTIVE_COARSE_FIXES.
          coarseStreakRef.current += 1;
          return;
        }
        coarseStreakRef.current = 0;
        hasLocationRef.current = true;
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setTracking(true);
        setError(null);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError(
            'Location access was denied. Enable location for this site in your browser/device settings to track your delivery.'
          );
          setTracking(false);
          setWatching(false);
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
          return;
        }
        // A transient failure (no fix yet, timeout) — the watch stays open,
        // the next update from the GPS chip may succeed.
        setError('Could not get your location. Check location permissions and try again.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
    );
    watchIdRef.current = id;
  }, []);

  const requestLocation = useCallback(() => start(), [start]);

  // If the user has already granted geolocation permission, resume tracking on
  // load without re-prompting — so progress keeps working across reloads.
  useEffect(() => {
    let cancelled = false;
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          if (!cancelled && status.state === 'granted') {
            setWatching(true);
            start();
          }
        })
        .catch(() => {
          /* permissions API unavailable — wait for an explicit request */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [start]);

  // Release the watch when the app unmounts.
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return { location, tracking, watching, error, requestLocation };
}
