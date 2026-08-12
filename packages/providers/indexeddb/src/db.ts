import { openDB, type IDBPDatabase } from 'idb';

// The one shared IndexedDB database both offline stores (the sync queue and
// the local blob holding area for not-yet-uploaded photos) live in. One
// module owns the name/version/upgrade path so both stores' object stores
// always get created together, regardless of which one opens the db first.
//
// Deliberately NOT memoized here (each caller memoizes its own connection,
// same as before this file existed) — a module-level cache would survive
// across tests that swap out `globalThis.indexedDB` for a fresh database
// per test, silently serving a stale connection to the old one.

export const DB_NAME = 'mbh-offline';
export const DB_VERSION = 2;
export const QUEUE_STORE = 'queue';
export const BLOB_STORE = 'blobs';

export function openOfflineDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'requestId' });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE);
      }
    },
  });
}
