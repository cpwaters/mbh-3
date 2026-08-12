import { IndexedDbBlobStore } from '@mbh/provider-indexeddb';

let store: IndexedDbBlobStore | null = null;

// One local blob store for the app — where a captured PoD photo sits until
// the sync queue can upload it. Single instance, same pattern as getReader().
export function getBlobStore(): IndexedDbBlobStore {
  if (store !== null) return store;
  store = new IndexedDbBlobStore();
  return store;
}
