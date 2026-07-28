import { Link, useNavigate } from 'react-router-dom';
import {
  MapPin,
  PoundSterling,
  Clock,
  TrendingUp,
  CheckCircle2,
  CheckCircle,
  User,
  Navigation,
} from 'lucide-react';
import { formatGbp } from '@mbh/domain';
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
import { Vehicles } from '../components/Vehicles';
import { CreateCompany } from '../components/CreateCompany';
import { EditProfile } from '../components/EditProfile';
import { useEarnings } from '../components/useEarnings';
import { useProfile } from '../components/useProfile';
import LiveLocationMap from './LiveLocationMap';
import { useApp } from './context';

const PAGE = 'max-w-4xl mx-auto px-4 py-6';

function fmtAddr(a: { town: string; postcode: string }): string {
  return `${a.town}, ${a.postcode}`;
}

function fmtDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function toActiveJob(job: { jobId: string; carrierTenantId: string; origin: { town: string; postcode: string }; destination: { town: string; postcode: string } }): ActiveJob {
  return {
    jobId: job.jobId,
    carrierTenantId: job.carrierTenantId,
    origin: fmtAddr(job.origin),
    destination: fmtAddr(job.destination),
  };
}

// Rough progress from the job's real status — a status-derived visual, not
// invented telemetry.
const STATUS_PROGRESS: Record<string, number> = {
  accepted: 20,
  collected: 55,
  in_transit: 85,
  delivered: 100,
  closed: 100,
};

export function Dashboard() {
  const app = useApp();

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
      <AvailableLoads
        carrierTenantId={app.selected.tenantId}
        listings={app.listings}
        getIdToken={app.auth.getIdToken}
        onAccepted={app.onAccepted}
        onChanged={app.reloadListings}
        hasActiveJob={app.job !== null}
      />
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
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-600">Progress</span>
                <span className="font-medium text-gray-900 capitalize">{job.status.replace('_', ' ')}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${STATUS_PROGRESS[job.status] ?? 0}%` }}
                ></div>
              </div>
            </JobCardSection>
            <JobCardActions>
              <button
                onClick={() => navigate('/map')}
                className="w-full sm:flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <Navigation className="w-4 h-4" />
                View Route
              </button>
            </JobCardActions>
          </JobCard>

          <MarkDelivered job={toActiveJob(job)} onCommit={app.commit} />
        </div>
      )}

      {app.queue.items.length > 0 && (
        <section className="mt-4 bg-white rounded-lg shadow-md border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-2">Waiting to send</h3>
          <ul className="divide-y divide-gray-100">
            {app.queue.items.map((item) => (
              <li key={item.requestId} className="flex items-center justify-between py-2.5">
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
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function MapPage() {
  const app = useApp();
  const route = app.job?.route;
  return (
    <div className={`${PAGE} space-y-4`}>
      <h1 className="text-2xl font-bold text-gray-900">Map</h1>
      {app.job !== null && route !== undefined ? (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
          <div className="p-4 flex items-center gap-2 text-sm text-gray-600 border-b border-gray-100">
            <MapPin className="w-4 h-4 text-gray-400" />
            {fmtAddr(app.job.origin)} → {fmtAddr(app.job.destination)}
            <span className="ml-auto font-semibold text-gray-900">
              {Math.round(route.distanceMeters / 1000)} km
            </span>
          </div>
          <div className="h-[60vh] min-h-[320px]">
            <LiveLocationMap
              origin={{ ...route.origin, label: fmtAddr(app.job.origin) }}
              destination={{ ...route.destination, label: fmtAddr(app.job.destination) }}
            />
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center mx-auto mb-3">
            <MapPin className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">No route to show</h2>
          <p className="text-gray-500">
            When you have an active delivery, its route appears here.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg ${tint}`}>{icon}</div>
        <span className="text-gray-600 text-sm">{label}</span>
      </div>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

export function EarningsPage() {
  const app = useApp();
  const actorId = app.auth.session?.actorId ?? null;
  const { loading, jobs } = useEarnings(actorId);

  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const startWeek = new Date(startToday);
  startWeek.setDate(startToday.getDate() - ((startToday.getDay() + 6) % 7)); // Monday
  const startMonth = new Date(startToday);
  startMonth.setDate(1);

  const sumSince = (since: number): number =>
    jobs.reduce((total, j) => {
      const at = Date.parse(j.deliveredAt);
      return !Number.isNaN(at) && at >= since ? total + j.priceGbpPence : total;
    }, 0);

  const today = sumSince(startToday.getTime());
  const week = sumSince(startWeek.getTime());
  const month = sumSince(startMonth.getTime());
  const allTime = jobs.reduce((total, j) => total + j.priceGbpPence, 0);

  return (
    <div className={PAGE}>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Earnings &amp; Performance</h1>
      <p className="text-gray-600 mb-6">Track your income and performance metrics</p>

      {loading ? (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 text-gray-500">
          Loading…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard icon={<PoundSterling className="w-5 h-5 text-green-600" />} tint="bg-green-100" label="Today" value={formatGbp(today)} />
            <StatCard icon={<TrendingUp className="w-5 h-5 text-blue-600" />} tint="bg-blue-100" label="This week" value={formatGbp(week)} />
            <StatCard icon={<PoundSterling className="w-5 h-5 text-purple-600" />} tint="bg-purple-100" label="This month" value={formatGbp(month)} />
          </div>

          <section className="mt-6 bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Recent deliveries</h2>
              <span className="text-sm text-gray-500">
                {jobs.length} total · {formatGbp(allTime)}
              </span>
            </div>
            {jobs.length === 0 ? (
              <p className="text-gray-500">Earnings appear here as you complete deliveries.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {jobs.slice(0, 10).map((j) => (
                  <li key={j.jobId} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                        <span className="truncate">
                          {j.origin.town} → {j.destination.town}
                        </span>
                      </p>
                      <p className="text-sm text-gray-500">{fmtDate(j.deliveredAt)}</p>
                    </div>
                    <span className="font-semibold text-green-600 shrink-0">{formatGbp(j.priceGbpPence)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export function DrivingTimePage() {
  return (
    <div className={PAGE}>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Driving time</h1>
      <p className="text-gray-600 mb-6">Your hours at the wheel and remaining drive time</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={<Clock className="w-5 h-5 text-blue-600" />} tint="bg-blue-100" label="Driven today" value="0h 00m" />
        <StatCard icon={<Clock className="w-5 h-5 text-amber-600" />} tint="bg-amber-100" label="Remaining" value="9h 00m" />
        <StatCard icon={<CheckCircle2 className="w-5 h-5 text-green-600" />} tint="bg-green-100" label="Break due in" value="4h 30m" />
      </div>
      <div className="mt-6 bg-white rounded-lg shadow-md border border-gray-200 p-6 text-gray-500">
        Drive-time tracking turns on once your vehicle is linked.
      </div>
    </div>
  );
}

export function ProfilePage() {
  const app = useApp();
  const s = app.auth.session;
  const actorId = s?.actorId ?? null;
  const { loading: profileLoading, profile, reload: reloadProfile } = useProfile(actorId);
  const name = profile?.displayName ?? s?.displayName ?? s?.email ?? 'Driver';
  return (
    <div className={`${PAGE} space-y-4`}>
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
            <User className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{name}</p>
            <p className="text-sm text-gray-500 truncate">{s?.email}</p>
            {profile?.phone !== undefined && profile.phone !== '' && (
              <p className="text-sm text-gray-500 truncate">{profile.phone}</p>
            )}
          </div>
        </div>
      </div>

      {!profileLoading && (
        <EditProfile
          getIdToken={app.auth.getIdToken}
          initialName={profile?.displayName ?? s?.displayName ?? ''}
          initialPhone={profile?.phone ?? ''}
          onSaved={reloadProfile}
        />
      )}

      {app.selected !== null && app.isCarrier && (
        <Vehicles carrierTenantId={app.selected.tenantId} getIdToken={app.auth.getIdToken} />
      )}

      <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
        <h2 className="font-bold text-gray-900 mb-3">Your companies</h2>
        <ul className="space-y-2">
          {app.tenants.map((t) => (
            <li key={t.tenantId} className="flex items-center justify-between">
              <span className="font-medium text-gray-800">{t.name}</span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                {t.capabilities.join(' / ')} · {t.role}
              </span>
            </li>
          ))}
          {app.tenants.length === 0 && <li className="text-gray-500">No companies linked yet.</li>}
        </ul>
      </div>

      <button
        type="button"
        onClick={() => void app.auth.signOut()}
        className="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
      >
        Sign out
      </button>
    </div>
  );
}
