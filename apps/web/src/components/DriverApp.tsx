import type { DeliverCapture } from '@mbh/client';
import type { DriverJobView } from '@mbh/provider-interfaces';
import { useSyncQueue } from './useSyncQueue';
import { useAuth } from './useAuth';
import { useActiveJob } from './useActiveJob';
import { SignIn } from './SignIn';
import { MarkDelivered, type ActiveJob } from './MarkDelivered';

// The driver app island (browser-only). Auth gates the app: signed out shows
// the sign-in screen; signed in, the real ID token authenticates every
// dispatch and the driver's current job is read from Firestore (rules-gated).
// The offline queue is fully real — a capture persists to IndexedDB and
// delivers to /api/dispatch when there is signal.

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
  const queue = useSyncQueue(auth.getIdToken);
  const { loading: jobLoading, job } = useActiveJob(auth.session?.actorId ?? null);

  async function commit(requestId: string, payload: DeliverCapture) {
    await queue.enqueue('deliverJob', payload, requestId);
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

      {jobLoading ? (
        <div className="card">
          <p className="muted">Loading your job…</p>
        </div>
      ) : job === null ? (
        <div className="card">
          <h2>No active job</h2>
          <p className="muted">When you accept a load, your current delivery will show here.</p>
        </div>
      ) : (
        <MarkDelivered job={toActiveJob(job)} onCommit={commit} />
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
