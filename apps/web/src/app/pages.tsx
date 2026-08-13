import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CheckCircle, Navigation, MapPin, Loader2, RotateCcw } from 'lucide-react';
import { formatGbp } from '@mbh/domain';
import { genRequestId } from '@mbh/client';
import { AvailableLoads } from '../components/AvailableLoads';
import { PostLoad } from '../components/PostLoad';
import { MarkDelivered, type ActiveJob } from '../components/MarkDelivered';
import {
  JobCard,
  JobCardRoute,
  JobCardPayment,
  JobCardSection,
  JobCardActions,
  JobCardStatusBadge,
} from './JobCard';
import { CreateCompany } from '../components/CreateCompany';
import { useApp } from './context';
import { STATUS_PROGRESS } from '../lib/progress';
import { dispatchAction } from '../lib/dispatch';
import { isFounder } from '../lib/founder';

// The device must be within this much of the journey (percent) before the
// delivery form is offered — "you've arrived". The device must be BOTH this far
// along the route AND within DELIVER_PROXIMITY_M of the destination: the percent
// guards very short trips (don't unlock near the origin) while the absolute cap
// stops a long trip unlocking miles out (95% of 355 km is still ~18 km away).
const DELIVER_GATE = 95;
const DELIVER_PROXIMITY_M = 500;

function fmtAddr(a: { town: string; postcode: string }): string {
  return `${a.town}, ${a.postcode}`;
}

// Full address (street + town + postcode), skipping any blank part. Shown on
// the driver's own accepted job — never on the anonymised public browse.
function fmtFullAddr(a: { line1: string; town: string; postcode: string }): string {
  return [a.line1, a.town, a.postcode]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(', ');
}

function fmtDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

// A one-off message handed over by the screen that navigated here (a recorded
// delivery). Read once and dropped from history, so going back later does not
// re-announce something that happened an hour ago.
function useFlash(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [flash] = useState(() => (location.state as { flash?: string } | null)?.flash ?? null);
  useEffect(() => {
    if (flash !== null) navigate('/', { replace: true, state: null });
  }, [flash, navigate]);
  return flash;
}

function toActiveJob(job: { jobId: string; carrierTenantId: string; origin: { town: string; postcode: string }; destination: { town: string; postcode: string } }): ActiveJob {
  return {
    jobId: job.jobId,
    carrierTenantId: job.carrierTenantId,
    origin: fmtAddr(job.origin),
    destination: fmtAddr(job.destination),
  };
}

export function Dashboard() {
  const app = useApp();
  const flash = useFlash();

  if (app.selected === null) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <CreateCompany
          getIdToken={app.auth.getIdToken}
          onCreated={(tenantId) => {
            app.reloadTenants();
            app.selectTenant(tenantId);
          }}
        />
      </div>
    );
  }

  if (app.isCarrier) {
    return (
      <>
        {flash !== null && (
          <div className="px-6 pt-6 max-w-3xl mx-auto">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-green-800 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              {flash}
            </div>
          </div>
        )}
        <AvailableLoads
          carrierTenantId={app.selected.tenantId}
          listings={app.listings}
          getIdToken={app.auth.getIdToken}
          onAccepted={app.onAccepted}
          onChanged={app.reloadListings}
          hasActiveJob={app.job !== null}
          driverLocation={app.location}
          tracking={app.tracking}
          watchingLocation={app.watchingLocation}
          onEnableLocation={app.requestLocation}
          locationError={app.locationError}
        />
      </>
    );
  }

  if (app.isShipper) {
    // The distributor dashboard arrives in a later increment; keep post-load.
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <PostLoad shipperTenantId={app.selected.tenantId} getIdToken={app.auth.getIdToken} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-1">No company yet</h2>
        <p className="text-gray-600">Your account isn't linked to a shipper or carrier yet.</p>
      </div>
    </div>
  );
}

export function ActiveJobsPage() {
  const app = useApp();
  const navigate = useNavigate();
  const job = app.job;
  const founder = isFounder(app.auth.session);
  const [relisting, setRelisting] = useState(false);

  // GPS journey progress when we have a fix; otherwise fall back to the
  // status-derived visual so the bar isn't blank before location is granted.
  const barPct = app.progress ?? (job ? (STATUS_PROGRESS[job.status] ?? 0) : 0);
  const atDestination =
    app.progress !== null &&
    app.progress >= DELIVER_GATE &&
    app.distanceRemainingMeters !== null &&
    app.distanceRemainingMeters <= DELIVER_PROXIMITY_M;

  function viewRoute() {
    // Ask for location permission (if not already tracking) so progress starts
    // flowing, then head to the map.
    app.requestLocation();
    navigate('/map');
  }

  // Founder-only: return this job's load to the available pool and clear the
  // active job (drops the job, re-lists the load).
  async function completeJob() {
    if (job === null) return;
    setRelisting(true);
    try {
      const res = await dispatchAction(
        app.auth.getIdToken,
        'relistJob',
        { carrierTenantId: job.carrierTenantId, jobId: job.jobId },
        genRequestId()
      );
      if (res.ok) {
        app.reloadJob();
        app.reloadListings();
      }
    } finally {
      setRelisting(false);
    }
  }

  // The delivery form is only offered once the device shows we've arrived AND
  // the job has reached in_transit (so deliverJob is a legal transition). Until
  // then we explain why it's locked — location is required, by design.
  function deliverySection() {
    if (job === null) return null;
    if (atDestination && job.status === 'in_transit') {
      return (
        <MarkDelivered
          job={toActiveJob(job)}
          location={app.location ?? undefined}
          onCommit={app.commit}
          // The job is done and gone from this screen — take the driver back
          // to the loads they can pick up next, rather than leaving them on a
          // card that no longer has anything to say. Only fires when the
          // capture actually reached the server; a queued one keeps them here,
          // where "Waiting to send" and any failure are visible.
          onDelivered={() => navigate('/', { state: { flash: 'Delivery recorded. Nice work.' } })}
        />
      );
    }
    if (atDestination) {
      // Arrived, but the status is still catching up to in_transit.
      return (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 flex items-center gap-3 text-gray-600">
          <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
          <span>Getting your delivery ready…</span>
        </div>
      );
    }
    return (
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-1 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-gray-400" />
          Delivery locked
        </h2>
        {!app.tracking && app.watchingLocation && !app.locationError ? (
          <p className="text-gray-600 flex items-center gap-2">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            Waiting for a GPS signal so we can tell when you reach {job.destination.town}…
          </p>
        ) : !app.tracking ? (
          <>
            <p className="text-gray-600 mb-4">
              Turn on location so we can tell when you reach {job.destination.town}. The delivery form
              unlocks automatically when you arrive.
            </p>
            {app.locationError && <p className="text-sm text-red-700 mb-3">{app.locationError}</p>}
            <button
              onClick={app.requestLocation}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Enable location
            </button>
          </>
        ) : (
          <p className="text-gray-600">
            {app.distanceRemainingMeters !== null
              ? `You're ${fmtDistance(app.distanceRemainingMeters)} from ${job.destination.town}. `
              : ''}
            The delivery form unlocks within {DELIVER_PROXIMITY_M} m of the destination.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Active Jobs</h1>
        <p className="text-gray-600">Track your current deliveries</p>
      </div>

      {job === null ? (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <div className="text-gray-400 mb-4">
            <CheckCircle className="w-16 h-16 mx-auto" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Active Jobs</h3>
          <p className="text-gray-600 mb-4">You don't have any active deliveries at the moment.</p>
          <Link
            to="/"
            className="inline-block bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Browse loads
          </Link>
        </div>
      ) : (
        <div className="grid gap-4">
          <JobCard>
            <JobCardRoute
              badge={<JobCardStatusBadge status={job.status} />}
              origin={fmtAddr(job.origin)}
              destination={fmtAddr(job.destination)}
            />
            <JobCardPayment amount={formatGbp(job.priceGbpPence)} />
            <JobCardSection>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    Collection
                  </div>
                  {job.originCompanyName && (
                    <div className="font-semibold text-gray-900">{job.originCompanyName}</div>
                  )}
                  <div className="text-sm text-gray-600">{fmtFullAddr(job.origin)}</div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
                    Delivery
                  </div>
                  {job.destinationCompanyName && (
                    <div className="font-semibold text-gray-900">{job.destinationCompanyName}</div>
                  )}
                  <div className="text-sm text-gray-600">{fmtFullAddr(job.destination)}</div>
                </div>
              </div>
            </JobCardSection>
            <JobCardSection>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Progress</span>
                <span className="font-medium text-gray-900">
                  {barPct}%
                  {app.progress === null && <span className="text-gray-400 font-normal"> · from status</span>}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${barPct}%` }}
                ></div>
              </div>
            </JobCardSection>
            <JobCardActions>
              <button
                onClick={viewRoute}
                className="w-full sm:flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <Navigation className="w-4 h-4" />
                View Route
              </button>
              {founder && (
                <button
                  onClick={() => void completeJob()}
                  disabled={relisting}
                  title="Founder: complete this job and return its load to Available Loads"
                  className="w-full sm:flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" />
                  {relisting ? 'Completing…' : 'Complete'}
                </button>
              )}
            </JobCardActions>
          </JobCard>

          {deliverySection()}
        </div>
      )}

      {app.queue.items.length > 0 && (
        <section className="mt-4 bg-white rounded-lg shadow-md border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-2">Waiting to send</h3>
          <ul className="divide-y divide-gray-100">
            {app.queue.items.map((item) => (
              <li key={item.requestId} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-700 text-sm">Delivery record</span>
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded ${
                      item.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {item.status === 'failed'
                      ? 'Needs attention'
                      : app.queue.online
                        ? 'Sending…'
                        : 'Waiting for signal…'}
                  </span>
                </div>
                {item.status === 'failed' && (
                  <div className="mt-1.5">
                    {item.lastError && <p className="text-xs text-red-700 mb-2">{item.lastError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => void app.queue.retry(item.requestId)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      >
                        Try again
                      </button>
                      <button
                        onClick={() => void app.queue.remove(item.requestId)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

