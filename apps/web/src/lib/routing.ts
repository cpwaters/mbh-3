import { metersToMiles } from '@mbh/domain';
import type { GeoPoint } from './geocode';

// Free public OSRM demo server (no API key, no billing). It has no SLA or
// rate-limit guarantees, so callers treat a failure as "no route available"
// and fall back to a straight line, not a hard error. Ported from the mbh-2
// prototype (client/src/lib/routing.ts) — used only to draw the road-following
// polyline; the authoritative distance comes from the load's server-computed
// route (the drain — packages/actions/src/drain.ts), which is what
// distributor/LoadsList.tsx actually displays.
export async function getDrivingRoute(origin: GeoPoint, destination: GeoPoint): Promise<GeoPoint[] | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();

    const coordinates = data?.routes?.[0]?.geometry?.coordinates;
    if (data?.code !== 'Ok' || !Array.isArray(coordinates)) {
      return null;
    }

    return coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng }));
  } catch (error) {
    console.error('Routing error:', error);
    return null;
  }
}

// A same-server, distance-only sibling of getDrivingRoute. Used to give a
// shipper an ESTIMATED mileage while filling in the create-load form,
// replacing a blank field they'd otherwise have to guess — never treated as
// authoritative (that's still the drain's route, once it lands).
export async function getDrivingDistanceMiles(origin: GeoPoint, destination: GeoPoint): Promise<number | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=false`;
    const res = await fetch(url);
    const data = await res.json();

    const distanceMeters = data?.routes?.[0]?.distance;
    if (data?.code !== 'Ok' || typeof distanceMeters !== 'number') {
      return null;
    }
    return metersToMiles(distanceMeters);
  } catch (error) {
    console.error('Routing error:', error);
    return null;
  }
}
