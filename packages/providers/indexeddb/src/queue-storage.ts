import { openDB, type IDBPDatabase } from 'idb';
import type { QueuedRequest, QueueStorage } from '@mbh/offline';

// Durable device-side persistence for the offline queue. Survives reloads
// and crashes — the driver's capture is safe the instant it is written,
// before any network. Keyed by requestId.

const DB_NAME = 'mbh-offline';
const DB_VERSION = 1;
const STORE = 'queue';

async function open(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'requestId' });
      }
    },
  });
}

export class IndexedDbQueueStorage implements QueueStorage {
  // The db handle is lazily opened and cached.
  private dbPromise: Promise<IDBPDatabase> | null = null;

  private db(): Promise<IDBPDatabase> {
    this.dbPromise ??= open();
    return this.dbPromise;
  }

  async put(item: QueuedRequest): Promise<void> {
    const db = await this.db();
    await db.put(STORE, item);
  }

  async get(requestId: string): Promise<QueuedRequest | null> {
    const db = await this.db();
    const item = (await db.get(STORE, requestId)) as QueuedRequest | undefined;
    return item ?? null;
  }

  async list(): Promise<QueuedRequest[]> {
    const db = await this.db();
    const all = (await db.getAll(STORE)) as QueuedRequest[];
    return all.sort((a, b) => (a.enqueuedAt < b.enqueuedAt ? -1 : a.enqueuedAt > b.enqueuedAt ? 1 : 0));
  }

  async delete(requestId: string): Promise<void> {
    const db = await this.db();
    await db.delete(STORE, requestId);
  }
}
