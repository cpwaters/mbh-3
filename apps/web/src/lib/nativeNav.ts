import { isIOS } from './platform';

export interface NavPoint {
  lat: number;
  lng: number;
}

// Opens the device's native map app with the journey pre-filled — Apple Maps on
// iOS/macOS, Google Maps everywhere else. Ported verbatim from the mbh-2
// prototype (client/src/lib/nativeNav.ts).
export function openNativeNavigation(origin: NavPoint | null, destination: NavPoint): void {
  const url = isIOS()
    ? `https://maps.apple.com/?${origin ? `saddr=${origin.lat},${origin.lng}&` : ''}daddr=${destination.lat},${destination.lng}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1${origin ? `&origin=${origin.lat},${origin.lng}` : ''}&destination=${destination.lat},${destination.lng}&travelmode=driving`;

  window.open(url, '_blank', 'noopener,noreferrer');
}
