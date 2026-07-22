import { describe, expect, it } from 'vitest';
import { AppError } from '@mbh/domain';
import { makeHarness, validPostLoadPayload } from './test-harness.js';

async function expectAppError(promise: Promise<unknown>, code: string): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code);
    return err as AppError;
  }
  throw new Error(`expected an AppError with code ${code}, but the call resolved`);
}

describe('dispatch pipeline', () => {
  it('rejects an unknown action type', async () => {
    const h = await makeHarness();
    await expectAppError(h.run('ship-owner', { type: 'noSuchAction', payload: {}, requestId: 'r1' }), 'not-found');
  });

  it('requires a requestId for idempotent actions', async () => {
    const h = await makeHarness();
    const err = await expectAppError(
      h.run('ship-owner', { type: 'postLoad', payload: validPostLoadPayload() }),
      'invalid-payload'
    );
    expect(err.field).toBe('requestId');
  });
});

describe('postLoad', () => {
  it('creates an available load, an audit entry, and a request marker atomically', async () => {
    const h = await makeHarness();
    const result = await h.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload(),
      requestId: 'req-post-1',
    });
    expect(result).toEqual({ loadId: 'load-1' });

    const load = await h.store.getDoc('loads/load-1');
    expect(load).toMatchObject({ status: 'available', tenantId: 'shipper-1', priceGbpPence: 68_000 });

    const audit = await h.store.getDoc('audit/audit-1');
    expect(audit).toMatchObject({ action: 'postLoad', actorId: 'ship-owner', source: 'member', loadId: 'load-1' });

    const marker = await h.store.getDoc('requests/req-post-1');
    expect(marker).toMatchObject({ actionType: 'postLoad', result: { loadId: 'load-1' } });
  });

  it('lets a dispatcher post but refuses a driver (wrong role)', async () => {
    const h = await makeHarness();
    await h.run('ship-dispatch', { type: 'postLoad', payload: validPostLoadPayload(), requestId: 'r-d' });
    await expectAppError(
      h.run('ship-driver', { type: 'postLoad', payload: validPostLoadPayload(), requestId: 'r-drv' }),
      'forbidden'
    );
  });

  it('refuses a non-member of the shipper tenant', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run('car-owner', { type: 'postLoad', payload: validPostLoadPayload(), requestId: 'r-x' }),
      'forbidden'
    );
  });

  it('rejects a bad payload with the offending field', async () => {
    const h = await makeHarness();
    const err = await expectAppError(
      h.run('ship-owner', {
        type: 'postLoad',
        payload: validPostLoadPayload({ priceGbpPence: -5 }),
        requestId: 'r-bad',
      }),
      'invalid-payload'
    );
    expect(err.field).toBe('priceGbpPence');
    // Nothing was written on a rejected payload.
    expect(await h.store.getDoc('loads/load-1')).toBeNull();
  });

  it('replays an identical requestId, returning the original result without a second effect', async () => {
    const h = await makeHarness();
    const first = await h.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload(),
      requestId: 'req-replay',
    });
    const replay = await h.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload({ priceGbpPence: 99_999 }), // different payload, same requestId
      requestId: 'req-replay',
    });
    expect(replay).toEqual(first);
    // Only ONE load exists, at the original price — the replay did not run.
    expect(await h.store.getDoc('loads/load-1')).toMatchObject({ priceGbpPence: 68_000 });
    expect(await h.store.getDoc('loads/load-2')).toBeNull();
  });

  it('refuses a requestId reused by a different action type', async () => {
    const h = await makeHarness();
    await h.run('ship-owner', { type: 'postLoad', payload: validPostLoadPayload(), requestId: 'shared-id' });
    await expectAppError(
      h.run('driver-1', {
        type: 'acceptLoad',
        payload: { carrierTenantId: 'carrier-1', loadId: 'load-1' },
        requestId: 'shared-id',
      }),
      'request-conflict'
    );
  });
});

describe('acceptLoad', () => {
  async function postAvailableLoad(h: Awaited<ReturnType<typeof makeHarness>>, requestId = 'r-post'): Promise<string> {
    const { loadId } = (await h.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload(),
      requestId,
    })) as { loadId: string };
    return loadId;
  }

  it('accepts an available load: matches it, creates the job + first event, audit, marker', async () => {
    const h = await makeHarness();
    const loadId = await postAvailableLoad(h);

    const result = await h.run('driver-1', {
      type: 'acceptLoad',
      payload: { carrierTenantId: 'carrier-1', loadId },
      requestId: 'req-accept-1',
    });
    expect(result).toEqual({ jobId: 'job-1' });

    expect(await h.store.getDoc(`loads/${loadId}`)).toMatchObject({ status: 'matched' });
    expect(await h.store.getDoc('jobs/job-1')).toMatchObject({
      status: 'accepted',
      driverActorId: 'driver-1',
      shipperTenantId: 'shipper-1',
      carrierTenantId: 'carrier-1',
      loadId,
    });
    expect(await h.store.getDoc('jobs/job-1/events/evt-1')).toMatchObject({
      type: 'job.accepted',
      source: 'member',
      actorId: 'driver-1',
    });
  });

  it('refuses a disabled member', async () => {
    const h = await makeHarness();
    const loadId = await postAvailableLoad(h);
    await expectAppError(
      h.run('driver-disabled', {
        type: 'acceptLoad',
        payload: { carrierTenantId: 'carrier-1', loadId },
        requestId: 'r-dis',
      }),
      'forbidden'
    );
  });

  it('refuses a second acceptance of the same load (CAS conflict)', async () => {
    const h = await makeHarness();
    const loadId = await postAvailableLoad(h);
    await h.run('driver-1', {
      type: 'acceptLoad',
      payload: { carrierTenantId: 'carrier-1', loadId },
      requestId: 'r-a1',
    });
    const err = await expectAppError(
      h.run('driver-2', {
        type: 'acceptLoad',
        payload: { carrierTenantId: 'carrier-1', loadId },
        requestId: 'r-a2',
      }),
      'conflict'
    );
    expect(err.recoverable).toBe(false);
  });

  it('enforces one active job per driver', async () => {
    const h = await makeHarness();
    const loadA = await postAvailableLoad(h, 'r-post-a');
    const loadB = await postAvailableLoad(h, 'r-post-b');
    await h.run('driver-1', {
      type: 'acceptLoad',
      payload: { carrierTenantId: 'carrier-1', loadId: loadA },
      requestId: 'r-accept-a',
    });
    await expectAppError(
      h.run('driver-1', {
        type: 'acceptLoad',
        payload: { carrierTenantId: 'carrier-1', loadId: loadB },
        requestId: 'r-accept-b',
      }),
      'conflict'
    );
    // Load B stays available for someone else.
    expect(await h.store.getDoc(`loads/${loadB}`)).toMatchObject({ status: 'available' });
  });

  it('returns not-found for a missing load', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run('driver-1', {
        type: 'acceptLoad',
        payload: { carrierTenantId: 'carrier-1', loadId: 'load-does-not-exist' },
        requestId: 'r-nf',
      }),
      'not-found'
    );
  });
});
