import { getStorage } from 'firebase-admin/storage';
import { ObjectStorageError, type ObjectStorageReader } from '@mbh/provider-interfaces';

// A minimal structural view of the admin SDK's bucket/file surface we
// consume, so this adapter can be unit-tested with a stub instead of a real
// bucket — same shape as NodemailerMailer's injectable MailTransport.
export interface StorageFileLike {
  download(): Promise<[Buffer]>;
}
export interface StorageBucketLike {
  file(ref: string): StorageFileLike;
}

// Server-side download of a PoD photo/signature for attaching to the
// invoice email. Uses the project's default Firebase-managed bucket (no
// dedicated bucket resource — see docs/HANDOFF.md). Only ever called from
// the drain, never a user request.
export class FirebaseStorageReader implements ObjectStorageReader {
  private bucket: StorageBucketLike | null;

  constructor(bucket?: StorageBucketLike) {
    this.bucket = bucket ?? null;
  }

  // Resolved lazily, on first use — not the constructor — so building
  // DrainDeps never depends on the Storage SDK/bucket being reachable at
  // startup, matching NodemailerMailer's lazy transport.
  private getBucket(): StorageBucketLike {
    if (this.bucket !== null) return this.bucket;
    this.bucket = getStorage().bucket() as unknown as StorageBucketLike;
    return this.bucket;
  }

  async download(ref: string): Promise<Buffer> {
    try {
      const [buffer] = await this.getBucket().file(ref).download();
      return buffer;
    } catch (cause) {
      throw new ObjectStorageError(`failed to download ${ref}: ${String(cause)}`);
    }
  }
}
