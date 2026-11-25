import { describe, expect, it } from 'vitest';
import { isShareCode } from '@mbh/domain';
import { FIXED_NOW, makeHarness, validPostLoadPayload, type Harness } from './test-harness.js';

async function postLoad(h: Harness, requestId = 'r-post'): Promise<string> {
  const { loadId } = (await h.run('ship-owner', {
    type: 'postLoad',
    payload: validPostLoadPayload(),
    requestId,
  })) as { loadId: string };
  return loadId;
}

const share = (h: Harness, actor: string, tenantId: string, loadId: string, requestId: string) =>
  h.run(actor, { type: 'shareLoad', payload: { tenantId, loadId }, requestId });

describe('shareLoad', () => {
  it('gives the shipper a short link for its load, recorded against the load', async () => {
    const h = await makeHarness();
    const loadId = await postLoad(h);
    const { code } = (await share(h, 'ship-dispatch', 'shipper-1', loadId, 'r-s1')) as { code: string };
    expect(isShareCode(code)).toBe(true);
    expect(await h.store.getDoc(`shares/${code}`)).toEqual({
      code,
      loadId,
      createdAt: FIXED_NOW,
      createdBy: 'ship-dispatch',
    });
  });

  it('hands back the same link however often, and whoever, shares it', async () => {
    const h = await makeHarness();
    const loadId = await postLoad(h);
    const first = (await share(h, 'ship-owner', 'shipper-1', loadId, 'r-s1')) as { code: string };
    const again = (await share(h, 'ship-owner', 'shipper-1', loadId, 'r-s2')) as { code: string };
    const byCarrier = (await share(h, 'driver-1', 'carrier-1', loadId, 'r-s3')) as { code: string };
    expect(again.code).toBe(first.code);
    expect(byCarrier.code).toBe(first.code);
    expect(await h.store.query({ collection: 'shares' })).toHaveLength(1);
  });

  it('lets a carrier share a load on the board, but not a stranger or another shipper', async () => {
    const h = await makeHarness();
    const loadId = await postLoad(h);
    await expect(share(h, 'driver-1', 'carrier-1', loadId, 'r-c')).resolves.toHaveProperty('code');
    await expect(share(h, 'outsider', 'carrier-1', loadId, 'r-o')).rejects.toMatchObject({ code: 'forbidden' });
    await h.store.runBatch([
      { kind: 'create', path: 'tenants/shipper-2', data: { tenantId: 'shipper-2', name: 'Other', capabilities: ['shipper'] } },
      {
        kind: 'create',
        path: 'tenants/shipper-2/members/other-owner',
        data: { tenantId: 'shipper-2', actorId: 'other-owner', role: 'owner', status: 'active', displayName: 'O' },
      },
    ]);
    await expect(share(h, 'other-owner', 'shipper-2', loadId, 'r-x')).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('refuses a load no longer on offer', async () => {
    const h = await makeHarness();
    const loadId = await postLoad(h);
    await h.run('driver-1', {
      type: 'acceptLoad',
      payload: { carrierTenantId: 'carrier-1', loadId },
      requestId: 'r-acc',
    });
    await expect(share(h, 'ship-owner', 'shipper-1', loadId, 'r-s')).rejects.toMatchObject({ code: 'conflict' });
  });
});
