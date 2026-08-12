// Local (device-side) storage for binary blobs captured offline — a photo
// File held until the sync queue can upload it. Lives here (the client-only
// interfaces) rather than packages/offline: that package is a pure engine
// with no browser types, and Blob is browser-only.
export interface BlobStore {
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | null>;
  delete(key: string): Promise<void>;
}
