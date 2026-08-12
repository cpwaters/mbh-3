import type { IDBPDatabase } from 'idb';
import type { BlobStore } from '@mbh/provider-interfaces';
import { openOfflineDb, BLOB_STORE } from './db.js';

// Local holding area for a photo captured offline, until the sync queue can
// upload it (see packages/offline's resolvePayload hook). Keyed by an
// arbitrary caller-chosen key (e.g. a generated local-blob:{uuid}), not the
// blob's eventual Storage ref — the two are unrelated until upload succeeds.

export class IndexedDbBlobStore implements BlobStore {
  private dbPromise: Promise<IDBPDatabase> | null = null;

  private db(): Promise<IDBPDatabase> {
    this.dbPromise ??= openOfflineDb();
    return this.dbPromise;
  }

  async put(key: string, blob: Blob): Promise<void> {
    const db = await this.db();
    await db.put(BLOB_STORE, blob, key);
  }

  async get(key: string): Promise<Blob | null> {
    const db = await this.db();
    const blob = (await db.get(BLOB_STORE, key)) as Blob | undefined;
    return blob ?? null;
  }

  async delete(key: string): Promise<void> {
    const db = await this.db();
    await db.delete(BLOB_STORE, key);
  }
}
