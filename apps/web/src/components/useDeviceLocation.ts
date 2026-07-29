import { useCallback, useEffect, useRef, useState } from 'react';
import type { GeoPoint } from '../lib/geocode';

// The device's live GPS position, owned once at the app root and shared through
// context. Progress, the delivery gate and the map all read the same fix, so
// the driver is only ever prompted for location permission once.
export interface DeviceLocationView {
  location: GeoPoint | null;
  tracking: boolean;
  error: string | null;
  // Ask for location permission (if not already tracking) and start watching.
  // Wired to the Active Job "View Route" button and the map's consent modal.
  requestLocation: () => void;
}

export function useDeviceLocation(): DeviceLocationView {
  const [location, setLocation] = useState<GeoPoint | null>(null);
  const [tracking, setTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const start = useCallback(() => {
    if (watchIdRef.current !== null) return; // already watching
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setError('Location tracking is not supported on this device.');
      return;
    }
    setError(null);
    const id = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setTracking(true);
      },
      (err) => {
        setError(
          err.code === err.PERMISSION_DENIED
            ? 'Location access was denied. Enable location for this site in your browser/device settings to track your delivery.'
            : 'Could not get your location. Check location permissions and try again.'
        );
        setTracking(false);
        watchIdRef.current = null;
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 }
    );
    watchIdRef.current = id;
    setTracking(true);
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

  // Release the watch when the app unmounts.
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return { location, tracking, error, requestLocation };
}
