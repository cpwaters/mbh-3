import type { BlobStore } from '@mbh/provider-interfaces';

// In-memory local blob store — the CI default for the offline queue's
// "photo captured but not yet uploaded" holding area.
export class InMemoryBlobStore implements BlobStore {
  private readonly blobs = new Map<string, Blob>();

  async put(key: string, blob: Blob): Promise<void> {
    this.blobs.set(key, blob);
  }

  async get(key: string): Promise<Blob | null> {
    return this.blobs.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.blobs.delete(key);
  }
}
