import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '../lib/geocode';

// The device's live GPS position, owned once at the app root and shared through
// context. Progress, the delivery gate and the map all read the same fix, so
// the driver is only ever prompted for location permission once.
export interface DeviceLocationView {
  location: GeoPoint | null;
  tracking: boolean;
  error: string | null;
  // Ask for location permission (if not already tracking) and start polling.
  // Wired to the Active Job "View Route" button and the map's consent modal.
  requestLocation: () => void;
}

// A compromise between battery life and freshness: a native maps app tracks
// continuously with sensor fusion (accelerometer/gyroscope dead-reckoning
// between GPS fixes), which the browser Geolocation API can't do — the best
// we can offer is a fresh fix often enough that a moving vehicle doesn't
// visibly outrun the last one. 60s (the original interval) meant the pin
// could lag up to a minute of travel behind reality; this trades some of
// the battery saving back for much less staleness.
const POLL_MS = 15_000;

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
  const [error, setError] = useState<string | null>(null);
  const pollIdRef = useRef<number | null>(null);
  const hasLocationRef = useRef(false);
  const coarseStreakRef = useRef(0);

  // A fresh fix every POLL_MS, not a continuous watch — the GPS radio isn't
  // kept running between samples (still a battery win over watchPosition on
  // a multi-hour job, just a smaller one now), and maximumAge: 0 means each
  // sample is a live read, not a cached one.
  const poll = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
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
          if (pollIdRef.current !== null) {
            window.clearInterval(pollIdRef.current);
            pollIdRef.current = null;
          }
          return;
        }
        // A transient failure (no fix yet, timeout) — keep polling, the next
        // attempt may succeed.
        setError('Could not get your location. Check location permissions and try again.');
      },
      // A shorter timeout than POLL_MS so a slow fix can't still be pending
      // when the next poll fires — no overlapping/out-of-order requests.
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 }
    );
  }, []);

  const start = useCallback(() => {
    if (pollIdRef.current !== null) return; // already polling
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location tracking is not supported on this device.');
      return;
    }
    setError(null);
    poll(); // an immediate first fix, then every POLL_MS
    pollIdRef.current = window.setInterval(poll, POLL_MS);
  }, [poll]);

  const requestLocation = useCallback(() => start(), [start]);

  // If the user has already granted geolocation permission, resume polling on
  // load without re-prompting — so progress keeps working across reloads.
  useEffect(() => {
    let cancelled = false;
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'geolocation' as PermissionName })
        .then((status) => {
          if (!cancelled && status.state === 'granted') start();
        })
        .catch(() => {
          /* permissions API unavailable — wait for an explicit request */
        });
    }
    return () => {
      cancelled = true;
    };
  }, [start]);

  // Stop polling when the app unmounts.
  useEffect(() => {
    return () => {
      if (pollIdRef.current !== null) {
        window.clearInterval(pollIdRef.current);
        pollIdRef.current = null;
      }
    };
  }, []);

  return { location, tracking, error, requestLocation };
}
