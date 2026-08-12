import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { IndexedDbBlobStore } from './blob-store.js';
import { IndexedDbQueueStorage } from './queue-storage.js';

beforeEach(() => {
  // Fresh database per test.
  globalThis.indexedDB = new IDBFactory();
});

describe('IndexedDbBlobStore', () => {
  it('persists and reads back a blob by key', async () => {
    const store = new IndexedDbBlobStore();
    const blob = new Blob(['photo bytes'], { type: 'image/jpeg' });
    await store.put('local-blob:1', blob);

    const got = await store.get('local-blob:1');
    expect(got).not.toBeNull();
    expect(await got?.text()).toBe('photo bytes');
  });

  it('returns null for a missing key', async () => {
    const store = new IndexedDbBlobStore();
    expect(await store.get('nope')).toBeNull();
  });

  it('deletes a stored blob', async () => {
    const store = new IndexedDbBlobStore();
    await store.put('k', new Blob(['x']));
    await store.delete('k');
    expect(await store.get('k')).toBeNull();
  });

  it('survives a new store instance (durability across reloads)', async () => {
    const first = new IndexedDbBlobStore();
    await first.put('local-blob:1', new Blob(['x']));
    const second = new IndexedDbBlobStore();
    expect(await second.get('local-blob:1')).not.toBeNull();
  });

  it('shares the same underlying database as the queue store (one upgrade creates both stores)', async () => {
    const blobs = new IndexedDbBlobStore();
    const queue = new IndexedDbQueueStorage();

    await blobs.put('local-blob:1', new Blob(['x']));
    await queue.put({
      requestId: 'r1',
      type: 'deliverJob',
      payload: { photoRefs: ['local-blob:1'] },
      status: 'queued',
      attempts: 0,
      enqueuedAt: '2026-08-01T00:00:00.000Z',
    });

    expect(await blobs.get('local-blob:1')).not.toBeNull();
    expect(await queue.get('r1')).not.toBeNull();
  });
});
