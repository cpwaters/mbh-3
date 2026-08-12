import { describe, expect, it } from 'vitest';
import { ObjectStorageError } from '@mbh/provider-interfaces';
import { InMemoryObjectStorage } from './in-memory-object-storage.js';

describe('InMemoryObjectStorage', () => {
  it('round-trips an uploaded blob back to the same bytes', async () => {
    const storage = new InMemoryObjectStorage();
    const blob = new Blob(['hello pod'], { type: 'text/plain' });
    await storage.upload('pod/job-1/photo-1.txt', blob, 'text/plain');

    const downloaded = await storage.download('pod/job-1/photo-1.txt');
    expect(downloaded.toString('utf8')).toBe('hello pod');
  });

  it('overwrites on re-upload to the same ref (matches real Storage semantics)', async () => {
    const storage = new InMemoryObjectStorage();
    await storage.upload('pod/job-1/photo-1.txt', new Blob(['first']), 'text/plain');
    await storage.upload('pod/job-1/photo-1.txt', new Blob(['second']), 'text/plain');

    expect((await storage.download('pod/job-1/photo-1.txt')).toString('utf8')).toBe('second');
  });

  it('throws a non-recoverable error for a ref that was never uploaded', async () => {
    const storage = new InMemoryObjectStorage();
    await expect(storage.download('pod/missing.jpg')).rejects.toBeInstanceOf(ObjectStorageError);
    await expect(storage.download('pod/missing.jpg')).rejects.toMatchObject({ recoverable: false });
  });

  it('throws a retryable error once when scripted, on either upload or download', async () => {
    const storage = new InMemoryObjectStorage().failOnce();
    await expect(storage.upload('a', new Blob(['x']), 'text/plain')).rejects.toMatchObject({ recoverable: true });
    // Recovered — the next call succeeds.
    await storage.upload('a', new Blob(['x']), 'text/plain');

    const storage2 = new InMemoryObjectStorage();
    await storage2.upload('b', new Blob(['y']), 'text/plain');
    storage2.failOnce();
    await expect(storage2.download('b')).rejects.toMatchObject({ recoverable: true });
    expect((await storage2.download('b')).toString('utf8')).toBe('y');
  });
});
