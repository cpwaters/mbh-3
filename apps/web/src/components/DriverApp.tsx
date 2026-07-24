import type { DeliverCapture } from '@mbh/client';
import type { DriverJobView } from '@mbh/provider-interfaces';
import { useSyncQueue } from './useSyncQueue';
import { useAuth } from './useAuth';
import { useMemberships } from './useMemberships';
import { useActiveJob } from './useActiveJob';
import { useListings } from './useListings';
import { AvailableLoads } from './AvailableLoads';
import { PostLoad } from './PostLoad';
import { SignIn } from './SignIn';
import { MarkDelivered, type ActiveJob } from './MarkDelivered';

// The app island (browser-only). Auth gates the app; signed in, the ID token
// authenticates every dispatch and the UI adapts to the user's tenants: a
// shipper sees "Post a load", a carrier sees their active delivery or the
// browse. The offline queue is fully real — a capture persists to IndexedDB
// and delivers to /api/dispatch when there is signal.

// Present the address as a short "Town, POSTCODE" line for the capture header.
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
  // All hooks run unconditionally (rules-of-hooks): the token comes from the
  // signed-in session, so drains are authenticated once signed in.
  const auth = useAuth();
  const actorId = auth.session?.actorId ?? null;
  const queue = useSyncQueue(auth.getIdToken);
  const { loading: memLoading, shipperTenantId, carrierTenantId } = useMemberships(actorId);
  const { loading: jobLoading, job, reload: reloadJob } = useActiveJob(actorId);
  const listings = useListings(carrierTenantId !== null);

  async function commit(requestId: string, payload: DeliverCapture) {
    await queue.enqueue('deliverJob', payload, requestId);
  }

  function onAccepted() {
    reloadJob();
    listings.reload();
  }

  if (!auth.ready) {
    return (
      <div className="app">
        <header className="topbar">
          <strong>MyBackHaul</strong>
        </header>
        <div className="card">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (auth.session === null) {
    return (
      <div className="app">
        <header className="topbar">
          <strong>MyBackHaul</strong>
        </header>
        <SignIn auth={auth} />
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>MyBackHaul</strong>
        <QueueBadge pending={queue.pending} online={queue.online} />
      </header>

      <p className="muted small">
        Signed in as {auth.session.email ?? auth.session.displayName ?? 'you'} ·{' '}
        <button
          type="button"
          onClick={() => void auth.signOut()}
          style={{ color: '#dc2626', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </p>

      {memLoading || jobLoading || listings.loading ? (
        <div className="card">
          <p className="muted">Loading…</p>
        </div>
      ) : (
        <>
          {shipperTenantId !== null && (
            <PostLoad shipperTenantId={shipperTenantId} getIdToken={auth.getIdToken} />
          )}

          {carrierTenantId !== null &&
            (job !== null ? (
              <MarkDelivered job={toActiveJob(job)} onCommit={commit} />
            ) : (
              <AvailableLoads
                carrierTenantId={carrierTenantId}
                listings={listings.listings}
                getIdToken={auth.getIdToken}
                onAccepted={onAccepted}
                onChanged={listings.reload}
              />
            ))}

          {shipperTenantId === null && carrierTenantId === null && (
            <div className="card">
              <h2>No company yet</h2>
              <p className="muted">Your account isn't linked to a shipper or carrier yet.</p>
            </div>
          )}
        </>
      )}

      {queue.items.length > 0 && (
        <section className="card">
          <h3>Waiting to send</h3>
          <ul className="queue">
            {queue.items.map((item) => (
              <li key={item.requestId}>
                <span>Delivery record</span>
                <StatusChip item={item} online={queue.online} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function QueueBadge({ pending, online }: { pending: number; online: boolean }) {
  if (pending === 0) {
    return <span className="badge badge-green">{online ? 'All sent' : 'Offline'}</span>;
  }
  return (
    <span className="badge badge-orange">
      {pending} waiting{online ? ' — sending…' : ' — offline'}
    </span>
  );
}

function StatusChip({ item, online }: { item: { status: string; lastError?: string }; online: boolean }) {
  if (item.status === 'failed') {
    return <span className="chip chip-red" title={item.lastError}>Needs attention</span>;
  }
  if (item.status === 'sending') {
    return <span className="chip chip-orange">Sending…</span>;
  }
  return <span className="chip chip-orange">{online ? 'Sending…' : 'Waiting for signal…'}</span>;
}
