import { describe, expect, it, vi } from 'vitest';
import { NonQueueableActionError, SyncQueue, type SyncQueueOptions } from './sync-queue.js';
import { InMemoryQueueStorage, ScriptableTransport } from './testing.js';

const ALLOWED = ['deliverJob', 'acceptLoad'];

function makeQueue(overrides: Partial<SyncQueueOptions> = {}) {
  const storage = new InMemoryQueueStorage();
  const transport = new ScriptableTransport();
  let clock = 0;
  const queue = new SyncQueue(storage, transport, {
    now: () => `2026-08-01T00:00:${String(clock++).padStart(2, '0')}.000Z`,
    allowedTypes: ALLOWED,
    ...overrides,
  });
  return { queue, storage, transport };
}

describe('enqueue (offline capture)', () => {
  it('captures a queued item with zero signal', async () => {
    const { queue } = makeQueue();
    await queue.enqueue('deliverJob', { jobId: 'j1' }, 'req-1');
    expect(await queue.pendingCount()).toBe(1);
    const items = await queue.items();
    expect(items[0]).toMatchObject({ requestId: 'req-1', type: 'deliverJob', status: 'queued', attempts: 0 });
  });

  it('refuses to queue a non-idempotent action', async () => {
    const { queue } = makeQueue();
    await expect(queue.enqueue('cancelLoad', {}, 'req-x')).rejects.toBeInstanceOf(NonQueueableActionError);
    expect(await queue.pendingCount()).toBe(0);
  });

  it('is idempotent — enqueuing the same requestId twice keeps one item', async () => {
    const { queue } = makeQueue();
    await queue.enqueue('deliverJob', { jobId: 'j1' }, 'req-1');
    await queue.enqueue('deliverJob', { jobId: 'j1', note: 'double tap' }, 'req-1');
    expect(await queue.pendingCount()).toBe(1);
  });
});

describe('drain (delivery on reconnect)', () => {
  it('delivers a queued item and removes it', async () => {
    const { queue, transport } = makeQueue();
    await queue.enqueue('deliverJob', { jobId: 'j1' }, 'req-1');
    transport.setOutcome('req-1', { outcome: 'ok', result: { jobId: 'j1', evidenceId: 'evd-1' } });

    const summary = await queue.drain();
    expect(summary).toEqual({ delivered: 1, retrying: 0, failedPermanent: 0 });
    expect(await queue.pendingCount()).toBe(0);
  });

  it('keeps an item queued while offline, then delivers when signal returns', async () => {
    const { queue, transport } = makeQueue();
    await queue.enqueue('deliverJob', { jobId: 'j1' }, 'req-1');

    // Still offline: default fallback is 'retry'.
    const first = await queue.drain();
    expect(first).toMatchObject({ delivered: 0, retrying: 1 });
    expect(await queue.pendingCount()).toBe(1);
    expect((await queue.items())[0]).toMatchObject({ status: 'queued', attempts: 1, lastError: 'offline' });

    // A second offline drain counts a second attempt.
    const second = await queue.drain();
    expect(second).toMatchObject({ retrying: 1 });
    expect((await queue.items())[0]).toMatchObject({ attempts: 2 });

    // Signal returns.
    transport.setOutcome('req-1', { outcome: 'ok', result: {} });
    const third = await queue.drain();
    expect(third).toMatchObject({ delivered: 1 });
    expect(await queue.pendingCount()).toBe(0);
  });

  it('marks a permanent (4xx) failure as failed and stops auto-retrying it', async () => {
    const { queue, transport } = makeQueue();
    await queue.enqueue('deliverJob', { jobId: 'j1' }, 'req-1');
    transport.setOutcome('req-1', { outcome: 'permanent', error: 'A recipient signature is required.' });

    const first = await queue.drain();
    expect(first).toMatchObject({ failedPermanent: 1 });
    const failed = (await queue.items())[0];
    expect(failed).toMatchObject({ status: 'failed', lastError: 'A recipient signature is required.' });

    // A subsequent drain does NOT re-send a failed item (needs a human).
    transport.sends.length = 0;
    const second = await queue.drain();
    expect(second).toEqual({ delivered: 0, retrying: 0, failedPermanent: 0 });
    expect(transport.sends).toHaveLength(0);
  });

  it('resends the SAME requestId across retries (server dedupes)', async () => {
    const { queue, transport } = makeQueue();
    await queue.enqueue('deliverJob', { jobId: 'j1' }, 'req-1');
    await queue.drain(); // retry (offline)
    transport.setOutcome('req-1', { outcome: 'ok', result: {} });
    await queue.drain(); // delivered
    expect(transport.sends.map((s) => s.requestId)).toEqual(['req-1', 'req-1']);
  });

  it('reclaims an orphaned "sending" item (a drain interrupted by reload) and delivers it', async () => {
    const { queue, storage, transport } = makeQueue();
    // A previous drain marked this item 'sending' then the page reloaded before
    // the outcome was recorded — leaving it orphaned in IndexedDB.
    await storage.put({
      requestId: 'req-1',
      type: 'deliverJob',
      payload: { jobId: 'j1' },
      status: 'sending',
      attempts: 1,
      enqueuedAt: '2026-08-01T00:00:00.000Z',
    });
    transport.setOutcome('req-1', { outcome: 'ok', result: {} });

    const summary = await queue.drain();
    expect(summary).toMatchObject({ delivered: 1 });
    expect(await queue.pendingCount()).toBe(0);
  });

  it('does not run two drains at once (no double-send of the same request)', async () => {
    const { queue, transport } = makeQueue();
    await queue.enqueue('deliverJob', { jobId: 'j1' }, 'req-1');
    transport.setOutcome('req-1', { outcome: 'ok', result: {} });

    // Fire two drains without awaiting the first — the guard makes the second a
    // no-op, so the request is sent exactly once.
    const [a, b] = await Promise.all([queue.drain(), queue.drain()]);
    const totalDelivered = a.delivered + b.delivered;
    expect(totalDelivered).toBe(1);
    expect(transport.sends.filter((s) => s.requestId === 'req-1')).toHaveLength(1);
    expect(await queue.pendingCount()).toBe(0);
  });

  it('drains multiple items oldest-first', async () => {
    const { queue, transport } = makeQueue();
    await queue.enqueue('deliverJob', { jobId: 'j1' }, 'req-1');
    await queue.enqueue('acceptLoad', { loadId: 'l2' }, 'req-2');
    transport.setFallback({ outcome: 'ok', result: {} });
    const summary = await queue.drain();
    expect(summary.delivered).toBe(2);
    expect(transport.sends.map((s) => s.requestId)).toEqual(['req-1', 'req-2']);
  });
});

describe('retry and discard (failed-record recovery)', () => {
  it('re-arms a failed item so the next drain resends it, succeeding once the cause is fixed', async () => {
    const { queue, transport } = makeQueue();
    await queue.enqueue('deliverJob', { jobId: 'j1' }, 'req-1');

    // A permanent failure (e.g. an illegal transition) marks it 'failed'.
    transport.setOutcome('req-1', { outcome: 'permanent', error: 'A job cannot move from accepted to delivered.' });
    await queue.drain();
    expect((await queue.items())[0]).toMatchObject({
      status: 'failed',
      lastError: 'A job cannot move from accepted to delivered.',
    });

    // A plain drain never touches a failed item — it needs a human.
    expect(await queue.drain()).toEqual({ delivered: 0, retrying: 0, failedPermanent: 0 });

    // The driver reached the destination (job now in_transit): re-arm + resend.
    transport.setOutcome('req-1', { outcome: 'ok', result: {} });
    await queue.retry('req-1');
    expect((await queue.items())[0]).toMatchObject({ status: 'queued' });
    expect(await queue.drain()).toMatchObject({ delivered: 1 });
    expect(await queue.pendingCount()).toBe(0);
  });

  it('discards an item the driver gives up on', async () => {
    const { queue } = makeQueue();
    await queue.enqueue('deliverJob', { jobId: 'j1' }, 'req-1');
    await queue.remove('req-1');
    expect(await queue.pendingCount()).toBe(0);
  });
});

describe('resolvePayload (last-second transform before send — e.g. uploading a local photo blob)', () => {
  it('sends the resolved payload, not the stored one', async () => {
    const resolvePayload = vi.fn().mockResolvedValue({ jobId: 'j1', photoRefs: ['pod/j1/req-1/0.jpg'] });
    const { queue, transport } = makeQueue({ resolvePayload });
    await queue.enqueue('deliverJob', { jobId: 'j1', photoRefs: ['local-blob:1'] }, 'req-1');
    transport.setOutcome('req-1', { outcome: 'ok', result: {} });

    await queue.drain();

    expect(resolvePayload).toHaveBeenCalledWith('deliverJob', { jobId: 'j1', photoRefs: ['local-blob:1'] }, 'req-1');
    expect(transport.sends[0]?.payload).toEqual({ jobId: 'j1', photoRefs: ['pod/j1/req-1/0.jpg'] });
  });

  it('never rewrites the STORED payload — a thrown resolvePayload (e.g. upload failure) leaves the original local refs for the next attempt', async () => {
    let attempt = 0;
    const resolvePayload = vi.fn().mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error('upload failed');
      return { jobId: 'j1', photoRefs: ['pod/j1/req-1/0.jpg'] };
    });
    const { queue, storage, transport } = makeQueue({ resolvePayload });
    await queue.enqueue('deliverJob', { jobId: 'j1', photoRefs: ['local-blob:1'] }, 'req-1');
    transport.setOutcome('req-1', { outcome: 'ok', result: {} });

    const first = await queue.drain();
    expect(first).toMatchObject({ retrying: 1 });
    // The stored item still carries the original local-blob ref — resolvePayload
    // will get another chance to upload the SAME blob on the next drain.
    expect((await storage.get('req-1'))?.payload).toEqual({ jobId: 'j1', photoRefs: ['local-blob:1'] });

    const second = await queue.drain();
    expect(second).toMatchObject({ delivered: 1 });
    expect(transport.sends.at(-1)?.payload).toEqual({ jobId: 'j1', photoRefs: ['pod/j1/req-1/0.jpg'] });
  });

  it('is a no-op when not provided — the stored payload is sent as-is', async () => {
    const { queue, transport } = makeQueue(); // no resolvePayload
    await queue.enqueue('deliverJob', { jobId: 'j1' }, 'req-1');
    transport.setOutcome('req-1', { outcome: 'ok', result: {} });

    await queue.drain();
    expect(transport.sends[0]?.payload).toEqual({ jobId: 'j1' });
  });
});
