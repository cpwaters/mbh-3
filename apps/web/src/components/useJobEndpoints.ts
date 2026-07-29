import { useEffect, useState } from 'react';
import type { DriverJobView } from '@mbh/provider-interfaces';
import { geocodePostcode, type GeoPoint } from '../lib/geocode';

export interface JobEndpoints {
  origin: GeoPoint | null;
  destination: GeoPoint | null;
}

// Resolves the journey's origin/destination coordinates for GPS progress.
// Prefers the server-computed route (already geocoded); falls back to geocoding
// the job's postcodes client-side so progress works even before the load's
// route enrichment has landed.
export function useJobEndpoints(job: DriverJobView | null): JobEndpoints {
  const [endpoints, setEndpoints] = useState<JobEndpoints>({ origin: null, destination: null });

  const routeOrigin = job?.route?.origin;
  const routeDestination = job?.route?.destination;
  const originPostcode = job?.origin.postcode;
  const destinationPostcode = job?.destination.postcode;

  useEffect(() => {
    if (originPostcode === undefined || destinationPostcode === undefined) {
      setEndpoints({ origin: null, destination: null });
      return;
    }
    if (routeOrigin && routeDestination) {
      setEndpoints({
        origin: { lat: routeOrigin.lat, lng: routeOrigin.lng },
        destination: { lat: routeDestination.lat, lng: routeDestination.lng },
      });
      return;
    }
    let cancelled = false;
    Promise.all([geocodePostcode(originPostcode), geocodePostcode(destinationPostcode)]).then(
      ([origin, destination]) => {
        if (!cancelled) setEndpoints({ origin, destination });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [routeOrigin, routeDestination, originPostcode, destinationPostcode]);

  return endpoints;
}
