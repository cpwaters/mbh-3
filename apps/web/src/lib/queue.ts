import { SyncQueue } from '@mbh/offline';
import { IDEMPOTENT_ACTION_TYPES } from '@mbh/actions';
import { IndexedDbQueueStorage } from '@mbh/provider-indexeddb';
import { HttpDispatchTransport } from '@mbh/provider-http';

// The composition root: this is the ONE place the concrete browser providers
// are chosen and injected into the pure SyncQueue engine. Everything above
// depends on interfaces.
export function createSyncQueue(getIdToken: () => Promise<string | null>): SyncQueue {
  const storage = new IndexedDbQueueStorage();
  const transport = new HttpDispatchTransport({ getIdToken });
  return new SyncQueue(storage, transport, {
    now: () => new Date().toISOString(),
    allowedTypes: IDEMPOTENT_ACTION_TYPES,
  });
}
