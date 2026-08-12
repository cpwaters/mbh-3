import type { IDBPDatabase } from 'idb';
import type { QueuedRequest, QueueStorage } from '@mbh/offline';
import { openOfflineDb, QUEUE_STORE } from './db.js';

// Durable device-side persistence for the offline queue. Survives reloads
// and crashes — the driver's capture is safe the instant it is written,
// before any network. Keyed by requestId.

export class IndexedDbQueueStorage implements QueueStorage {
  // The db handle is lazily opened and cached per instance (not module-wide
  // — see db.ts's comment on why).
  private dbPromise: Promise<IDBPDatabase> | null = null;

  private db(): Promise<IDBPDatabase> {
    this.dbPromise ??= openOfflineDb();
    return this.dbPromise;
  }

  async put(item: QueuedRequest): Promise<void> {
    const db = await this.db();
    await db.put(QUEUE_STORE, item);
  }

  async get(requestId: string): Promise<QueuedRequest | null> {
    const db = await this.db();
    const item = (await db.get(QUEUE_STORE, requestId)) as QueuedRequest | undefined;
    return item ?? null;
  }

  async list(): Promise<QueuedRequest[]> {
    const db = await this.db();
    const all = (await db.getAll(QUEUE_STORE)) as QueuedRequest[];
    return all.sort((a, b) => (a.enqueuedAt < b.enqueuedAt ? -1 : a.enqueuedAt > b.enqueuedAt ? 1 : 0));
  }

  async delete(requestId: string): Promise<void> {
    const db = await this.db();
    await db.delete(QUEUE_STORE, requestId);
  }
}
