import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { QueuedRequest } from '@mbh/offline';
import { IndexedDbQueueStorage } from './queue-storage.js';

// The SAME behaviours the in-memory QueueStorage double provides — proven
// against a real IndexedDB implementation (fake-indexeddb). If these diverge,
// the offline engine's tests would lie about production behaviour.

function item(id: string, enqueuedAt: string): QueuedRequest {
  return { requestId: id, type: 'deliverJob', payload: { jobId: id }, status: 'queued', attempts: 0, enqueuedAt };
}

beforeEach(() => {
  // Fresh database per test.
  globalThis.indexedDB = new IDBFactory();
});

describe('IndexedDbQueueStorage', () => {
  it('persists and reads back an item', async () => {
    const store = new IndexedDbQueueStorage();
    await store.put(item('r1', '2026-08-01T00:00:00.000Z'));
    expect(await store.get('r1')).toMatchObject({ requestId: 'r1', type: 'deliverJob', status: 'queued' });
  });

  it('returns null for a missing item', async () => {
    const store = new IndexedDbQueueStorage();
    expect(await store.get('nope')).toBeNull();
  });

  it('overwrites on put with the same requestId (keyed, not duplicated)', async () => {
    const store = new IndexedDbQueueStorage();
    await store.put(item('r1', '2026-08-01T00:00:00.000Z'));
    await store.put({ ...item('r1', '2026-08-01T00:00:00.000Z'), status: 'failed', lastError: 'x' });
    const all = await store.list();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ status: 'failed', lastError: 'x' });
  });

  it('lists items oldest-first', async () => {
    const store = new IndexedDbQueueStorage();
    await store.put(item('r2', '2026-08-01T00:00:02.000Z'));
    await store.put(item('r1', '2026-08-01T00:00:01.000Z'));
    await store.put(item('r3', '2026-08-01T00:00:03.000Z'));
    expect((await store.list()).map((i) => i.requestId)).toEqual(['r1', 'r2', 'r3']);
  });

  it('deletes an item', async () => {
    const store = new IndexedDbQueueStorage();
    await store.put(item('r1', '2026-08-01T00:00:00.000Z'));
    await store.delete('r1');
    expect(await store.get('r1')).toBeNull();
    expect(await store.list()).toHaveLength(0);
  });

  it('survives a new storage instance (durability across reloads)', async () => {
    const first = new IndexedDbQueueStorage();
    await first.put(item('r1', '2026-08-01T00:00:00.000Z'));
    // A fresh instance re-opens the same database (same global indexedDB).
    const second = new IndexedDbQueueStorage();
    expect(await second.get('r1')).toMatchObject({ requestId: 'r1' });
  });
});
