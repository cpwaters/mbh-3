import { describe, expect, it } from 'vitest';
import { FOUNDER_EMAIL } from '@mbh/domain';
import { FIXED_NOW, makeHarness } from './test-harness.js';

const founder = { actorId: 'founder-1', email: FOUNDER_EMAIL };

describe('setFeatureFlag', () => {
  it('the founder switches a feature on and off, one switch at a time', async () => {
    const h = await makeHarness();
    await expect(
      h.run(founder, { type: 'setFeatureFlag', payload: { feature: 'ratings', enabled: true }, requestId: 'r-on' })
    ).resolves.toEqual({ feature: 'ratings', enabled: true });
    expect(await h.store.getDoc('platformConfig/features')).toEqual({ ratings: true, updatedAt: FIXED_NOW });

    await h.run(founder, { type: 'setFeatureFlag', payload: { feature: 'ratings', enabled: false }, requestId: 'r-off' });
    expect(await h.store.getDoc('platformConfig/features')).toMatchObject({ ratings: false });
  });

  it('is the founder’s alone', async () => {
    const h = await makeHarness();
    await expect(
      h.run('car-owner', { type: 'setFeatureFlag', payload: { feature: 'ratings', enabled: true }, requestId: 'r-x' })
    ).rejects.toMatchObject({ code: 'forbidden' });
    expect(await h.store.getDoc('platformConfig/features')).toBeNull();
  });

  it('refuses a feature that does not exist', async () => {
    const h = await makeHarness();
    await expect(
      h.run(founder, { type: 'setFeatureFlag', payload: { feature: 'teleport', enabled: true }, requestId: 'r-t' })
    ).rejects.toMatchObject({ code: 'invalid-payload' });
  });
});
