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

const POLL_MS = 60_000;

export function useDeviceLocation(): DeviceLocationView {
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollIdRef = useRef<number | null>(null);

  // A fresh fix once a minute, not a continuous watch — the GPS radio isn't
  // kept running between samples (a real battery win on a multi-hour job),
  // and maximumAge: 0 means each sample is a live read, not a cached one.
  const poll = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
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
        // minute's attempt may succeed.
        setError('Could not get your location. Check location permissions and try again.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 }
    );
  }, []);

  const start = useCallback(() => {
    if (pollIdRef.current !== null) return; // already polling
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location tracking is not supported on this device.');
      return;
    }
    setError(null);
    poll(); // an immediate first fix, then once a minute
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
