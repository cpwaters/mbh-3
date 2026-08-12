import { SyncQueue } from '@mbh/offline';
import { IDEMPOTENT_ACTION_TYPES } from '@mbh/actions';
import { IndexedDbQueueStorage } from '@mbh/provider-indexeddb';
import { HttpDispatchTransport } from '@mbh/provider-http';
import { getBlobStore } from './blob-store';
import { getObjectStorageUploader } from './object-storage';

// The composition root: this is the ONE place the concrete browser providers
// are chosen and injected into the pure SyncQueue engine. Everything above
// depends on interfaces.

interface DeliverJobPayload {
  jobId: string;
  photoRefs: string[];
  [key: string]: unknown;
}

function isDeliverJobPayload(payload: unknown): payload is DeliverJobPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'jobId' in payload &&
    'photoRefs' in payload &&
    Array.isArray((payload as { photoRefs: unknown }).photoRefs)
  );
}

// A photo captured offline is held locally (see MarkDelivered.tsx) as a
// `local-blob:{uuid}` ref. Right before the queue actually sends a
// deliverJob, upload any such refs to Storage and rewrite them to the real
// path — deterministic (jobId/requestId/index), so redoing this on a retry
// safely overwrites rather than duplicating. The signature is left alone:
// it's already real bytes (an inline data URL), never a local-blob ref.
async function resolveDeliverJobPayload(type: string, payload: unknown, requestId: string): Promise<unknown> {
  if (type !== 'deliverJob' || !isDeliverJobPayload(payload)) return payload;

  const blobStore = getBlobStore();
  const uploader = getObjectStorageUploader();

  const photoRefs = await Promise.all(
    payload.photoRefs.map(async (ref, index) => {
      if (!ref.startsWith('local-blob:')) return ref; // already a real ref
      const blob = await blobStore.get(ref);
      if (blob === null) {
        throw new Error(`local photo blob missing for ref: ${ref}`);
      }
      const storagePath = `pod/${payload.jobId}/${requestId}/${index}.jpg`;
      await uploader.upload(storagePath, blob, blob.type !== '' ? blob.type : 'image/jpeg');
      return storagePath;
    })
  );

  return { ...payload, photoRefs };
}

export function createSyncQueue(getIdToken: () => Promise<string | null>): SyncQueue {
  const storage = new IndexedDbQueueStorage();
  const transport = new HttpDispatchTransport({ getIdToken });
  return new SyncQueue(storage, transport, {
    now: () => new Date().toISOString(),
    allowedTypes: IDEMPOTENT_ACTION_TYPES,
    resolvePayload: resolveDeliverJobPayload,
  });
}
