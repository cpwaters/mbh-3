import { useEffect, useState } from 'react';
import { ArrowRight, Box, Calendar, MapPin, Truck, Weight } from 'lucide-react';
import { TRIAL_DAYS, formatGbp, isShareCode, type Listing } from '@mbh/domain';
import { getReader } from '../lib/reader';
import { AdrPill, loadVehicleSummary } from '../app/JobCard';
import { useAuth } from './useAuth';

type State = { kind: 'loading' } | { kind: 'missing' } | { kind: 'gone' } | { kind: 'error' } | { kind: 'ready'; listing: Listing };

// The code from /l/<code>. Anything else (a trailing slash aside) is no link.
export function codeFromPath(pathname: string): string | null {
  const match = /^\/l\/([^/]+)\/?$/.exec(pathname);
  const code = match?.[1] ?? null;
  return code !== null && isShareCode(code) ? code : null;
}

// What a shared load link opens, for anyone, signed in or not: the load as a
// carrier sees it on the board (route by town and postcode, dates, price,
// what it is and the vehicle it needs), and the way in to take it. Never the
// shipper's addresses or contacts: the listing does not hold them.
//
// Someone not signed in is taken as new to MyBackHaul: the sign-up pages come
// first (as a haulier, who can take the load, or as a shipper), with signing
// in offered underneath. Someone already signed in on this device just opens
// the app.
export default function SharedLoadPage() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const auth = useAuth();
  const signedIn = auth.ready && auth.session !== null;

  useEffect(() => {
    const code = codeFromPath(window.location.pathname);
    if (code === null) {
      setState({ kind: 'missing' });
      return;
    }
    let cancelled = false;
    getReader()
      .sharedLoad(code)
      .then((shared) => {
        if (cancelled) return;
        if (shared === null) setState({ kind: 'missing' });
        else if (shared.status === 'gone') setState({ kind: 'gone' });
        else setState({ kind: 'ready', listing: shared.listing });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50">
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-16">
        <a href="/" className="inline-flex items-center gap-2 mb-8">
          <img src="/android-chrome-384x384.png" alt="" width="36" height="36" className="w-9 h-9" />
          <span className="text-2xl font-bold text-gray-900">MyBackHaul</span>
        </a>

        {state.kind === 'loading' && <p className="text-gray-600">Loading the load…</p>}

        {(state.kind === 'missing' || state.kind === 'gone' || state.kind === 'error') && (
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              {state.kind === 'gone'
                ? 'This load has already gone'
                : state.kind === 'missing'
                  ? 'We could not find that load'
                  : 'Could not load this right now'}
            </h1>
            <p className="text-gray-600 mb-6">
              {state.kind === 'gone'
                ? 'Another haulier has taken it, or the shipper has withdrawn it. There are more backhauls on the board.'
                : state.kind === 'missing'
                  ? 'The link may be mistyped. There are more backhauls on the board.'
                  : 'Check your signal and try again.'}
            </p>
            <JoinButtons signedIn={signedIn} />
          </div>
        )}

        {state.kind === 'ready' && <LoadCard listing={state.listing} signedIn={signedIn} />}
      </div>
    </main>
  );
}

function LoadCard({ listing, signedIn }: { listing: Listing; signedIn: boolean }) {
  const vehicle = loadVehicleSummary(listing.vehicleSizes, listing.vehicleTypes);
  return (
    <article className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 sm:p-8">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-600 mb-2">Backhaul available</p>
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{listing.origin.town}</span>
        <ArrowRight className="w-6 h-6 text-gray-400" aria-label="to" />
        <span>{listing.destination.town}</span>
      </h1>
      <p className="mt-1 text-gray-600 inline-flex items-center gap-1.5">
        <MapPin className="w-4 h-4" aria-hidden="true" />
        {listing.origin.postcode} to {listing.destination.postcode}
      </p>
      {listing.adrRequired === true && (
        <div className="mt-3">
          <AdrPill />
        </div>
      )}

      <p className="mt-6 text-4xl font-bold text-green-600">{formatGbp(listing.priceGbpPence)}</p>

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <Fact icon={<Calendar className="w-4 h-4" />} label="Collect by" value={listing.pickupBy} />
        <Fact icon={<Calendar className="w-4 h-4" />} label="Deliver by" value={listing.deliverBy} />
        <Fact icon={<Box className="w-4 h-4" />} label="Pallets" value={String(listing.palletCount)} />
        <Fact icon={<Weight className="w-4 h-4" />} label="Weight" value={`${listing.weightKg.toLocaleString('en-GB')} kg`} />
        {vehicle !== null && <Fact icon={<Truck className="w-4 h-4" />} label="Vehicle" value={vehicle} />}
      </dl>
      {listing.description !== '' && <p className="mt-4 text-gray-700">{listing.description}</p>}

      <div className="mt-8 border-t border-gray-100 pt-6">
        <p className="text-gray-700 mb-4">
          {signedIn
            ? 'Open MyBackHaul to accept it: it is on your Available Loads.'
            : `Join MyBackHaul to accept this load and see every backhaul on the board. Every account starts with a ${TRIAL_DAYS}-day free trial.`}
        </p>
        <JoinButtons signedIn={signedIn} />
      </div>
    </article>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-gray-500" aria-hidden="true">
        {icon}
      </span>
      <div>
        <dt className="text-gray-500">{label}</dt>
        <dd className="font-medium text-gray-900">{value}</dd>
      </div>
    </div>
  );
}

function JoinButtons({ signedIn }: { signedIn: boolean }) {
  if (signedIn) {
    return (
      <a
        href="/app/"
        className="w-full inline-flex items-center justify-center bg-blue-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-blue-700"
      >
        Open in MyBackHaul
      </a>
    );
  }
  return (
    <div>
      <div className="flex flex-col sm:flex-row gap-3">
        <a
          href="/app/signup/carrier"
          className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 bg-blue-600 text-white px-5 py-3 rounded-lg font-semibold hover:bg-blue-700"
        >
          <span>Join as a haulier</span>
          <span className="text-xs font-normal text-blue-100">Take backhauls like this one</span>
        </a>
        <a
          href="/app/signup/shipper"
          className="flex-1 inline-flex flex-col items-center justify-center gap-0.5 border border-gray-300 bg-white text-gray-800 px-5 py-3 rounded-lg font-semibold hover:bg-gray-50"
        >
          <span>Join as a shipper</span>
          <span className="text-xs font-normal text-gray-500">Post your own loads</span>
        </a>
      </div>
      <p className="mt-4 text-center text-sm text-gray-600">
        Already on MyBackHaul?{' '}
        <a href="/app/" className="font-medium text-blue-700 hover:underline">
          Sign in to accept
        </a>
      </p>
    </div>
  );
}
