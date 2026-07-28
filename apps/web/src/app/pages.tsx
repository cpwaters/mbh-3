import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle, Navigation } from 'lucide-react';
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
import { CreateCompany } from '../components/CreateCompany';
import { useApp } from './context';

function fmtAddr(a: { town: string; postcode: string }): string {
  return `${a.town}, ${a.postcode}`;
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

