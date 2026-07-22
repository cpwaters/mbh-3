import { describe, expect, it } from 'vitest';
import { ALL_ACTION_TYPES, buildRegistry, IDEMPOTENT_ACTION_TYPES } from './registry.js';

describe('action registry', () => {
  it('builds without duplicate action types', () => {
    const registry = buildRegistry();
    expect([...registry.keys()].sort()).toEqual([...ALL_ACTION_TYPES].sort());
  });

  it('pins which actions are idempotent — a handler cannot silently drift', () => {
    const registry = buildRegistry();
    const actuallyIdempotent = [...registry.values()]
      .filter((h) => h.idempotent)
      .map((h) => h.type)
      .sort();
    expect(actuallyIdempotent).toEqual([...IDEMPOTENT_ACTION_TYPES].sort());
  });
});
