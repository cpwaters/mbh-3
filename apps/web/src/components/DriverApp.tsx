import { useMemo } from 'react';
import type { DeliverCapture } from '@mbh/client';
import { useSyncQueue } from './useSyncQueue';
import { MarkDelivered, type ActiveJob } from './MarkDelivered';

// The driver app island. Until sign-in + the dispatch backend land (step 6),
// there is no real "current job" over the wire, so the active job is read
// from URL params purely to demonstrate the capture flow; without them the
// app shows an honest empty state. The offline queue is fully real — a
// capture persists to IndexedDB and retries against /api/dispatch.

function readDemoJob(): ActiveJob | null {
  if (typeof window === 'undefined') return null;
  const p = new URLSearchParams(window.location.search);
  const jobId = p.get('job');
  const carrierTenantId = p.get('carrier');
  if (jobId === null || carrierTenantId === null) return null;
  return {
    jobId,
    carrierTenantId,
    origin: p.get('origin') ?? 'Manchester, M17 1WS',
    destination: p.get('destination') ?? 'Edinburgh, EH6 6JJ',
  };
}

export default function DriverApp() {
  // No auth yet: token is always null, so drains will retry (no signal to a
  // real backend). This is honest offline behaviour, not a bug.
  const getIdToken = useMemo(() => async () => null, []);
  const queue = useSyncQueue(getIdToken);
  const job = useMemo(readDemoJob, []);

  async function commit(requestId: string, payload: DeliverCapture) {
    await queue.enqueue('deliverJob', payload, requestId);
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>MyBackHaul</strong>
        <QueueBadge pending={queue.pending} online={queue.online} />
      </header>

      {job === null ? (
        <div className="card">
          <h2>No active job</h2>
          <p className="muted">When you accept a load, your current delivery will show here.</p>
        </div>
      ) : (
        <MarkDelivered job={job} onCommit={commit} />
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
