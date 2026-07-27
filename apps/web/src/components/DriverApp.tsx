import { Truck, LogOut } from 'lucide-react';
import type { DeliverCapture } from '@mbh/client';
import type { DriverJobView } from '@mbh/provider-interfaces';
import { useSyncQueue } from './useSyncQueue';
import { useAuth } from './useAuth';
import { useTenants } from './useTenants';
import { useActiveJob } from './useActiveJob';
import { useListings } from './useListings';
import { AvailableLoads } from './AvailableLoads';
import { PostLoad } from './PostLoad';
import { TenantSwitcher } from './TenantSwitcher';
import { SignIn } from './SignIn';
import { MarkDelivered, type ActiveJob } from './MarkDelivered';

// The app island (browser-only). Auth gates the app; the UI adapts to the
// user's tenants — a shipper sees "Post a load", a carrier their active
// delivery or the browse. Design incorporated from the prototype: white header,
// blue accents, gray-50 content.

function label(a: { town: string; postcode: string }): string {
  return `${a.town}, ${a.postcode}`;
}
function toActiveJob(job: DriverJobView): ActiveJob {
  return {
    jobId: job.jobId,
    carrierTenantId: job.carrierTenantId,
    origin: label(job.origin),
    destination: label(job.destination),
  };
}

export default function DriverApp() {
  const auth = useAuth();
  const actorId = auth.session?.actorId ?? null;
  const queue = useSyncQueue(auth.getIdToken);
  const tenants = useTenants(actorId);
  const { loading: jobLoading, job, reload: reloadJob } = useActiveJob(actorId);
  const selected = tenants.selected;
  const isShipper = selected?.capabilities.includes('shipper') ?? false;
  const isCarrier = selected?.capabilities.includes('carrier') ?? false;
  const listings = useListings(isCarrier);

  async function commit(requestId: string, payload: DeliverCapture) {
    await queue.enqueue('deliverJob', payload, requestId);
  }
  function onAccepted() {
    reloadJob();
    listings.reload();
  }

  if (!auth.ready) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (auth.session === null) {
    return <SignIn auth={auth} />;
  }

  const busy = tenants.loading || jobLoading || listings.loading;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="w-7 h-7 text-blue-600" />
            <span className="text-lg font-bold text-gray-900">MyBackHaul</span>
          </div>
          <div className="flex items-center gap-3">
            <QueueBadge pending={queue.pending} online={queue.online} />
            <button
              type="button"
              onClick={() => void auth.signOut()}
              className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <p className="text-sm text-gray-500">
            Signed in as {auth.session.email ?? auth.session.displayName ?? 'you'}
          </p>
          {selected !== null && (
            <TenantSwitcher tenants={tenants.tenants} selected={selected} onSelect={tenants.select} />
          )}
        </div>

        {busy ? (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6 text-gray-500">
            Loading…
          </div>
        ) : selected === null ? (
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-1">No company yet</h2>
            <p className="text-gray-600">Your account isn't linked to a shipper or carrier yet.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {isShipper && <PostLoad shipperTenantId={selected.tenantId} getIdToken={auth.getIdToken} />}

            {isCarrier &&
              (job !== null ? (
                <MarkDelivered job={toActiveJob(job)} onCommit={commit} />
              ) : (
                <AvailableLoads
                  carrierTenantId={selected.tenantId}
                  listings={listings.listings}
                  getIdToken={auth.getIdToken}
                  onAccepted={onAccepted}
                  onChanged={listings.reload}
                />
              ))}
          </div>
        )}

        {queue.items.length > 0 && (
          <section className="bg-white rounded-lg shadow-md border border-gray-200 p-5 mt-4">
            <h3 className="font-bold text-gray-900 mb-2">Waiting to send</h3>
            <ul className="divide-y divide-gray-100">
              {queue.items.map((item) => (
                <li key={item.requestId} className="flex items-center justify-between py-2.5">
                  <span className="text-gray-700 text-sm">Delivery record</span>
                  <StatusChip item={item} online={queue.online} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}

function QueueBadge({ pending, online }: { pending: number; online: boolean }) {
  if (pending === 0) {
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">
        {online ? 'All sent' : 'Offline'}
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
      {pending} waiting{online ? ' — sending…' : ' — offline'}
    </span>
  );
}

function StatusChip({
  item,
  online,
}: {
  item: { status: string; lastError?: string };
  online: boolean;
}) {
  if (item.status === 'failed') {
    return (
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-700"
        title={item.lastError}
      >
        Needs attention
      </span>
    );
  }
  const text = item.status === 'sending' || online ? 'Sending…' : 'Waiting for signal…';
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-700">
      {text}
    </span>
  );
}
