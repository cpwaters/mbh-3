import { describe, expect, it } from 'vitest';
import { InMemoryBlobStore } from './in-memory-blob-store.js';

describe('InMemoryBlobStore', () => {
  it('stores and retrieves a blob by key', async () => {
    const store = new InMemoryBlobStore();
    const blob = new Blob(['photo bytes'], { type: 'image/jpeg' });
    await store.put('local-blob:1', blob);

    expect(await store.get('local-blob:1')).toBe(blob);
  });

  it('returns null for an unknown key', async () => {
    const store = new InMemoryBlobStore();
    expect(await store.get('nope')).toBeNull();
  });

  it('deletes a stored blob', async () => {
    const store = new InMemoryBlobStore();
    await store.put('k', new Blob(['x']));
    await store.delete('k');
    expect(await store.get('k')).toBeNull();
  });
});
