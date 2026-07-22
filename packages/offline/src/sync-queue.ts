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

  // Attempt to deliver every deliverable item (queued only; a 'failed' item
  // is terminal and needs a human, not an automatic retry). Safe to call on
  // reconnect and on an interval.
  async drain(): Promise<DrainSummary> {
    const summary: DrainSummary = { delivered: 0, retrying: 0, failedPermanent: 0 };
    const items = await this.storage.list();

    for (const item of items) {
      if (item.status !== 'queued') continue;

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

    return summary;
  }
}
