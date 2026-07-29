import type {
  DispatchTransport,
  DrainSummary,
  QueuedRequest,
  QueueStorage,
} from './types.js';

export interface SyncQueueOptions {
  now(): string;
  // The action types that are safe to queue (the idempotent set). Injected,
  // not imported — the engine stays decoupled from the action registry.
  allowedTypes: readonly string[];
}

export class NonQueueableActionError extends Error {
  constructor(type: string) {
    super(
      `Action "${type}" is not offline-safe and must never be queued. Only idempotent actions may be enqueued.`
    );
    this.name = 'NonQueueableActionError';
  }
}

// The pure offline sync-queue. Capture enqueues locally (succeeds with zero
// signal); drain delivers to the server, honestly recording state. Because
// every item carries a stable requestId, a resend after a lost response is
// deduped server-side — so "retry" is always safe.
export class SyncQueue {
  // Ensures only one drain runs at a time. Enqueue, the reconnect handler, and
  // the interval backstop can all fire a drain; overlapping drains would
  // double-process reclaimed items.
  private draining = false;

  constructor(
    private readonly storage: QueueStorage,
    private readonly transport: DispatchTransport,
    private readonly opts: SyncQueueOptions
  ) {}

  // Capture. Idempotent: enqueuing the same requestId twice is a no-op, so a
  // double-tap or a retried save never creates two items.
  async enqueue(type: string, payload: unknown, requestId: string): Promise<void> {
    if (!this.opts.allowedTypes.includes(type)) {
      throw new NonQueueableActionError(type);
    }
    const existing = await this.storage.get(requestId);
    if (existing !== null) return;
    await this.storage.put({
      requestId,
      type,
      payload,
      status: 'queued',
      attempts: 0,
      enqueuedAt: this.opts.now(),
    });
  }

  // Everything not yet delivered — what the "waiting for signal" badge counts.
  async pendingCount(): Promise<number> {
    const items = await this.storage.list();
    return items.length;
  }

  async items(): Promise<QueuedRequest[]> {
    return this.storage.list();
  }

  // Re-arm a failed item for another attempt — e.g. the driver has now reached
  // the destination (so the delivery is a legal transition), or signal is back.
  // The next drain picks it up. No-op if the item is gone.
  async retry(requestId: string): Promise<void> {
    const item = await this.storage.get(requestId);
    if (item === null) return;
    await this.storage.put({ ...item, status: 'queued' });
  }

  // Discard an item the driver has chosen to give up on (a permanently-failed
  // record that will never succeed — e.g. it belonged to a job that's gone).
  async remove(requestId: string): Promise<void> {
    await this.storage.delete(requestId);
  }

  // Attempt to deliver every deliverable item. Safe to call on reconnect and
  // on an interval. A 'failed' item is terminal and needs a human, not an
  // automatic retry.
  async drain(): Promise<DrainSummary> {
    const summary: DrainSummary = { delivered: 0, retrying: 0, failedPermanent: 0 };
    // One drain at a time — otherwise a second drain could pick up an item the
    // first has already marked 'sending' and resend it in parallel.
    if (this.draining) return summary;
    this.draining = true;
    try {
      const items = await this.storage.list();

      for (const item of items) {
        // Deliver 'queued' items, and RECLAIM 'sending' ones. An item is only
        // left 'sending' when a previous drain was interrupted (page reload,
        // PWA suspend, tab close) between marking it in-flight and recording
        // the outcome. Since no drain runs concurrently (guard above) and every
        // item carries a stable requestId the server dedupes, resending is
        // always safe — without this, an orphaned 'sending' item would be
        // skipped forever and appear stuck "waiting to send" despite signal.
        if (item.status !== 'queued' && item.status !== 'sending') continue;

        // Mark in-flight without counting the attempt yet — the attempt is
        // counted exactly once, on the terminal outcome below.
        await this.storage.put({ ...item, status: 'sending' });

        let outcome;
        try {
          outcome = await this.transport.send({
            type: item.type,
            payload: item.payload,
            requestId: item.requestId,
          });
        } catch (err) {
          // A thrown transport (unexpected) is treated as transient.
          outcome = { outcome: 'retry' as const, error: err instanceof Error ? err.message : 'send failed' };
        }

        if (outcome.outcome === 'ok') {
          await this.storage.delete(item.requestId);
          summary.delivered += 1;
        } else if (outcome.outcome === 'retry') {
          await this.storage.put({ ...item, status: 'queued', attempts: item.attempts + 1, lastError: outcome.error });
          summary.retrying += 1;
        } else {
          await this.storage.put({ ...item, status: 'failed', attempts: item.attempts + 1, lastError: outcome.error });
          summary.failedPermanent += 1;
        }
      }
    } finally {
      this.draining = false;
    }

    return summary;
  }
}
