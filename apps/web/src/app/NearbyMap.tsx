import { useEffect } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatGbp } from '@mbh/domain';
import type { GeoPoint } from '../lib/geocode';
import { milesToMetres } from '../lib/nearby';
import type { RankedListing } from '../components/useNearbyListings';
// Importing LiveLocationMap's module fixes Leaflet's default marker icons for
// the bundle (it repoints them at the bundled assets on import).
import './LiveLocationMap';

// The driver's patch: where they are, the radius they chose drawn around
// them, and a pin on the collection point of every load inside it.

const youIcon = L.divIcon({
  className: '',
  html: '<div style="width:18px;height:18px;border-radius:50%;background:#2563eb;border:3px solid white;box-shadow:0 0 3px rgba(0,0,0,0.5);"></div>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// Frames the whole radius, re-framing when it changes or the driver moves
// far enough to matter — not on every GPS fix, which would fight a driver
// panning the map.
function FitRadius({ centre, radiusMiles }: { centre: GeoPoint; radiusMiles: number }) {
  const map = useMap();
  const lat = Math.round(centre.lat * 100) / 100;
  const lng = Math.round(centre.lng * 100) / 100;
  useEffect(() => {
    map.fitBounds(L.latLng(lat, lng).toBounds(milesToMetres(radiusMiles) * 2), { padding: [16, 16] });
  }, [map, lat, lng, radiusMiles]);
  return null;
}

export default function NearbyMap({
  centre,
  radiusMiles,
  loads,
  onSelect,
}: {
  centre: GeoPoint;
  radiusMiles: number;
  loads: RankedListing[];
  onSelect: (loadId: string) => void;
}) {
  return (
    <MapContainer
      center={[centre.lat, centre.lng]}
      zoom={10}
      className="h-80 sm:h-96 w-full rounded-2xl border border-gray-200 z-0"
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitRadius centre={centre} radiusMiles={radiusMiles} />
      <Circle
        center={[centre.lat, centre.lng]}
        radius={milesToMetres(radiusMiles)}
        pathOptions={{ color: '#2563eb', weight: 1, fillOpacity: 0.06 }}
      />
      <Marker position={[centre.lat, centre.lng]} icon={youIcon}>
        <Popup>You are here</Popup>
      </Marker>
      {loads.map(({ listing, pickup }) =>
        pickup === null ? null : (
          <Marker
            key={listing.loadId}
            position={[pickup.lat, pickup.lng]}
            eventHandlers={{ click: () => onSelect(listing.loadId) }}
          >
            <Popup>
              <strong>
                {listing.origin.town} → {listing.destination.town}
              </strong>
              <br />
              {formatGbp(listing.priceGbpPence)}
            </Popup>
          </Marker>
        )
      )}
    </MapContainer>
  );
}
