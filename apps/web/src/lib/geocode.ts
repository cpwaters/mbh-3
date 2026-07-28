export interface GeoPoint {
  lat: number;
  lng: number;
}

// Free, no-API-key UK postcode lookup (https://postcodes.io). Ported from the
// mbh-2 prototype (client/src/lib/geocode.ts).
export async function geocodePostcode(postcode: string): Promise<GeoPoint | null> {
  const trimmed = postcode.trim();
  if (!trimmed) return null;

  try {
    const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(trimmed)}`);
    const data = await res.json();

    if (data.status === 200 && data.result) {
      return { lat: data.result.latitude, lng: data.result.longitude };
    }
    // A validly-formatted but decommissioned postcode still has last-known coordinates.
    if (data.terminated?.latitude != null && data.terminated?.longitude != null) {
      return { lat: data.terminated.latitude, lng: data.terminated.longitude };
    }
    return null;
  } catch (error) {
    console.error('Geocoding error for postcode', postcode, error);
    return null;
  }
}

// Location strings in this app are formatted as "City, POSTCODE".
export function extractPostcode(locationLabel: string): string {
  const parts = locationLabel.split(',');
  return parts[parts.length - 1]?.trim() || '';
}
