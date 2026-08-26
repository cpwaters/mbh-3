import { ObjectStorageError, type ObjectStorageReader, type ObjectStorageUploader } from '@mbh/provider-interfaces';

// Scriptable in-memory object storage — the CI default, implementing BOTH
// the upload (client) and download (server) sides. Real deployments never
// run both from the same process; a test conveniently can. `failNext`
// forces one retryable error so a caller's backoff path is testable.
export class InMemoryObjectStorage implements ObjectStorageUploader, ObjectStorageReader {
  private readonly blobs = new Map<string, { blob: Blob; contentType: string }>();
  private failNext = false;

  failOnce(): this {
    this.failNext = true;
    return this;
  }

  async upload(ref: string, blob: Blob, contentType: string): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new ObjectStorageError('scripted object storage failure');
    }
    this.blobs.set(ref, { blob, contentType });
  }

  // Object URLs are a browser API; tests only need something stable and
  // distinguishable, so the ref itself stands in for one.
  async viewUrl(ref: string): Promise<string> {
    if (!this.blobs.has(ref)) {
      throw new ObjectStorageError(`no object at ref: ${ref}`, false);
    }
    return `memory://${ref}`;
  }

  async download(ref: string): Promise<Buffer> {
    if (this.failNext) {
      this.failNext = false;
      throw new ObjectStorageError('scripted object storage failure');
    }
    const entry = this.blobs.get(ref);
    if (entry === undefined) {
      throw new ObjectStorageError(`no object at ref: ${ref}`, false);
    }
    return Buffer.from(await entry.blob.arrayBuffer());
  }
}
