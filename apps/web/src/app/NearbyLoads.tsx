import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, MapPin, Navigation } from 'lucide-react';
import { formatGbp, type Listing } from '@mbh/domain';
import { genRequestId } from '@mbh/client';
import { useApp } from './context';
import NearbyMap from './NearbyMap';
import { dispatchAction } from '../lib/dispatch';
import { RADIUS_OPTIONS_MILES, formatMiles, loadRadius, saveRadius, withinRadius, type RadiusMiles } from '../lib/nearby';
import { useNearbyListings } from '../components/useNearbyListings';
import { JobCard, JobCardActions, JobCardPayment, JobCardRoute, JobCardStatusBadge } from './JobCard';

// "Loads near you": the Map page. Where the phone is, a radius the driver
// sets, and the available loads whose collection point falls inside it —
// on a map, and as a list nearest first that can be accepted from here.
//
// The distance is straight-line from the phone to the pickup postcode, the
// same measure the Available Loads list sorts by. It is a "roughly how far"
// filter; the road miles will be more.
export default function NearbyLoads() {
  const app = useApp();
  const [radius, setRadius] = useState<RadiusMiles>(loadRadius);
  const [selected, setSelected] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement | null>());

  const ranked = useNearbyListings(app.listings, app.location);
  const split = useMemo(() => withinRadius(ranked, radius), [ranked, radius]);
  const hasActiveJob = app.job !== null;

  function chooseRadius(next: RadiusMiles): void {
    setRadius(next);
    saveRadius(next);
  }

  // A pin tapped on the map brings its card into view below.
  useEffect(() => {
    if (selected === null) return;
    cardRefs.current.get(selected)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, [selected]);

  async function accept(load: Listing): Promise<void> {
    const carrierTenantId = app.selected?.tenantId ?? null;
    if (carrierTenantId === null) {
      setError('Your carrier account is still loading — try again in a moment.');
      return;
    }
    setError(null);
    setAccepting(load.loadId);
    try {
      const res = await dispatchAction(app.auth.getIdToken, 'acceptLoad', { carrierTenantId, loadId: load.loadId }, genRequestId());
      if (res.ok) app.onAccepted();
      else {
        setError(res.error.message);
        app.reloadListings();
      }
    } finally {
      setAccepting(null);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Loads near you</h1>
        <p className="text-gray-600">Backhauls with a collection within your chosen distance of where you are now.</p>
      </div>

      <div role="group" aria-label="Search radius" className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-gray-700 mr-1">Within</span>
        {RADIUS_OPTIONS_MILES.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={radius === option}
            onClick={() => chooseRadius(option)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              radius === option ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {option} miles
          </button>
        ))}
      </div>

      {app.location === null ? (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 space-y-3">
          <div className="flex items-start gap-3">
            <MapPin className={`w-5 h-5 text-blue-600 shrink-0 mt-0.5 ${app.watchingLocation ? 'animate-pulse' : ''}`} />
            <p className="text-sm text-blue-900">
              {app.watchingLocation
                ? 'Waiting for a GPS signal — this can take a few seconds outdoors, longer indoors.'
                : 'Loads near you needs your location, to know where “near” is. It is used on this phone to measure distances.'}
            </p>
          </div>
          {!app.watchingLocation && (
            <button
              type="button"
              onClick={app.requestLocation}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Enable location
            </button>
          )}
          {app.locationError !== null && (
            <p className="flex items-start gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              {app.locationError}
            </p>
          )}
        </div>
      ) : (
        <NearbyMap centre={app.location} radiusMiles={radius} loads={split.inside} onSelect={setSelected} />
      )}

      {hasActiveJob && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            You have a job in progress. Finish it on the Active Jobs page before accepting another.
          </p>
        </div>
      )}

      {error !== null && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {app.location !== null && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-gray-900">
            {split.inside.length === 0
              ? `No loads within ${radius} miles`
              : `${split.inside.length} load${split.inside.length === 1 ? '' : 's'} within ${radius} miles`}
          </h2>
          {split.outside > 0 && (
            <p className="text-sm text-gray-600">
              {split.outside} more further away
              {radius < RADIUS_OPTIONS_MILES[RADIUS_OPTIONS_MILES.length - 1] ? ' — widen the distance to see them.' : '.'}
            </p>
          )}
          {split.unplaced > 0 && (
            <p className="text-sm text-gray-500">
              {split.unplaced} still being placed on the map — they appear once their collection postcode is found.
            </p>
          )}

          <div className="grid gap-4">
            {split.inside.map(({ listing, distanceMeters }) => (
              <div
                key={listing.loadId}
                ref={(el) => {
                  cardRefs.current.set(listing.loadId, el);
                }}
                className={selected === listing.loadId ? 'ring-2 ring-blue-500 rounded-2xl' : ''}
              >
                <JobCard>
                  <JobCardRoute
                    badge={<JobCardStatusBadge status="available" />}
                    origin={`${listing.origin.town}, ${listing.origin.postcode}`}
                    destination={`${listing.destination.town}, ${listing.destination.postcode}`}
                  />
                  {distanceMeters !== null && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-0.5 text-sm font-medium text-blue-700">
                      <Navigation className="w-3.5 h-3.5" />
                      Collection {formatMiles(distanceMeters)} away
                    </div>
                  )}
                  <JobCardPayment amount={formatGbp(listing.priceGbpPence)} />
                  <p className="mt-2 text-sm text-gray-600">
                    {listing.palletCount} pallets · {listing.weightKg.toLocaleString('en-GB')} kg · collect by{' '}
                    {listing.pickupBy}
                  </p>
                  <JobCardActions>
                    <button
                      type="button"
                      onClick={() => void accept(listing)}
                      disabled={hasActiveJob || accepting === listing.loadId}
                      className="w-full sm:flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {accepting === listing.loadId ? 'Accepting…' : 'Accept Load'}
                    </button>
                  </JobCardActions>
                </JobCard>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
