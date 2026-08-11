import { describe, expect, it, vi } from 'vitest';
import { ObjectStorageError } from '@mbh/provider-interfaces';
import { FirebaseStorageReader, type StorageBucketLike } from './index.js';

function stubBucket(download: () => Promise<[Buffer]>): StorageBucketLike {
  return { file: () => ({ download }) };
}

describe('FirebaseStorageReader', () => {
  it('downloads and returns the buffer', async () => {
    const bucket = stubBucket(async () => [Buffer.from('photo bytes')]);
    const reader = new FirebaseStorageReader(bucket);

    const buffer = await reader.download('pod/job-1/photo-1.jpg');
    expect(buffer.toString('utf8')).toBe('photo bytes');
  });

  it('wraps a download failure as ObjectStorageError', async () => {
    const bucket = stubBucket(() => Promise.reject(new Error('object not found')));
    const reader = new FirebaseStorageReader(bucket);

    await expect(reader.download('pod/missing.jpg')).rejects.toBeInstanceOf(ObjectStorageError);
  });

  it('passes the requested ref to the bucket', async () => {
    const file = vi.fn().mockReturnValue({ download: async () => [Buffer.from('x')] });
    const bucket: StorageBucketLike = { file };
    const reader = new FirebaseStorageReader(bucket);

    await reader.download('pod/job-1/signature.png');
    expect(file).toHaveBeenCalledWith('pod/job-1/signature.png');
  });
});
