import { describe, expect, it } from 'vitest';
import { makeHarness, validPostLoadPayload } from './test-harness.js';

// Role alone must not authorize a cross-capability action: a carrier tenant
// (even its owner) cannot post loads; a shipper tenant (even its driver)
// cannot accept them. The tenant capability is the invariant.
describe('tenant capability enforcement', () => {
  it('refuses postLoad from a carrier tenant even by its owner', async () => {
    const harness = await makeHarness();
    // car-owner is an owner (a listing role) of carrier-1, which is not a shipper.
    await expect(
      harness.run('car-owner', {
        type: 'postLoad',
        payload: validPostLoadPayload({ shipperTenantId: 'carrier-1' }),
        requestId: 'r1',
      })
    ).rejects.toMatchObject({ code: 'forbidden' });

    // No load or listing leaked out.
    expect(await harness.store.getDoc('loads/load-1')).toBeNull();
  });

  it('refuses acceptLoad by a shipper tenant even by its driver', async () => {
    const harness = await makeHarness();
    const { loadId } = (await harness.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload(),
      requestId: 'r1',
    })) as { loadId: string };

    // ship-driver is a driver (an accept role) of shipper-1, which is not a carrier.
    await expect(
      harness.run('ship-driver', {
        type: 'acceptLoad',
        payload: { carrierTenantId: 'shipper-1', loadId },
        requestId: 'r2',
      })
    ).rejects.toMatchObject({ code: 'forbidden' });

    // The load is untouched — still available, still listed.
    expect(await harness.store.getDoc(`loads/${loadId}`).then((l) => l?.status)).toBe('available');
    expect(await harness.store.getDoc(`listings/${loadId}`)).not.toBeNull();
  });

  it('still allows the correct capabilities (shipper posts, carrier accepts)', async () => {
    const harness = await makeHarness();
    const { loadId } = (await harness.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload(),
      requestId: 'r1',
    })) as { loadId: string };
    const accepted = (await harness.run('driver-1', {
      type: 'acceptLoad',
      payload: { carrierTenantId: 'carrier-1', loadId },
      requestId: 'r2',
    })) as { jobId: string };
    expect(accepted.jobId).toBeTruthy();
  });
});
