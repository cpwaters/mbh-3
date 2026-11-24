import { useEffect } from 'react';
import { Circle, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { formatGbp } from '@mbh/domain';
import type { GeoPoint } from '../lib/geocode';
import { milesToMetres } from '../lib/nearby';
import type { RankedListing } from '../components/useNearbyListings';

// The driver's patch: the centre they chose (their position, or a postcode),
// the radius drawn around it, and a pin on the collection point of every load
// inside it.

// Every marker is drawn, not an image: Leaflet's default marker images need
// their URLs repointed for the bundle, and a pin that silently fails to load
// is a load that silently is not on the map.
const loadIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#16a34a;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.45);"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 22],
  popupAnchor: [0, -22],
});

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
  centreLabel,
  radiusMiles,
  loads,
  onSelect,
}: {
  centre: GeoPoint;
  // What the blue dot is: "You are here", or the postcode searched around.
  centreLabel: string;
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
        <Popup>{centreLabel}</Popup>
      </Marker>
      {loads.map(({ listing, pickup }) =>
        pickup === null ? null : (
          <Marker
            key={listing.loadId}
            position={[pickup.lat, pickup.lng]}
            icon={loadIcon}
            title={`${listing.origin.town} to ${listing.destination.town}`}
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
