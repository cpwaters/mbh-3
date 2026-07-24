import { describe, expect, it } from 'vitest';
import { makeHarness, validPostLoadPayload } from './test-harness.js';

// The listing projection lifecycle through the real action layer.
describe('carrier listing projection', () => {
  it('postLoad publishes a safe listing alongside the private load', async () => {
    const harness = await makeHarness();
    const { loadId } = (await harness.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload(),
      requestId: 'r1',
    })) as { loadId: string };

    const listing = await harness.store.getDoc(`listings/${loadId}`);
    expect(listing).toMatchObject({
      loadId,
      shipperTenantId: 'shipper-1',
      origin: { town: 'Trafford', postcode: 'M17 1WS' },
      priceGbpPence: 68_000,
    });
    // The safe projection omits the raw street address.
    expect(JSON.stringify(listing)).not.toContain('Distribution Way');
  });

  it('acceptLoad removes the listing so a taken load is no longer browsable', async () => {
    const harness = await makeHarness();
    const { loadId } = (await harness.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload(),
      requestId: 'r1',
    })) as { loadId: string };
    expect(await harness.store.getDoc(`listings/${loadId}`)).not.toBeNull();

    await harness.run('driver-1', {
      type: 'acceptLoad',
      payload: { carrierTenantId: 'carrier-1', loadId },
      requestId: 'r2',
    });

    expect(await harness.store.getDoc(`listings/${loadId}`)).toBeNull();
    // The raw load remains, now matched.
    expect(await harness.store.getDoc(`loads/${loadId}`).then((l) => l?.status)).toBe('matched');
  });
});
