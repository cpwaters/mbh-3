import { describe, expect, it } from 'vitest';
import { AppError } from '@mbh/domain';
import { makeHarness, validPostLoadPayload, type Harness } from './test-harness.js';

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

// A job under way, so movement may legitimately be recorded against it.
async function jobInTransit(h: Harness): Promise<string> {
  const { loadId } = (await h.run('ship-owner', {
    type: 'postLoad',
    payload: validPostLoadPayload(),
    requestId: 'r-post',
  })) as { loadId: string };
  const { jobId } = (await h.run('driver-1', {
    type: 'acceptLoad',
    payload: { carrierTenantId: 'carrier-1', loadId },
    requestId: 'r-accept',
  })) as { jobId: string };
  await h.run('driver-1', {
    type: 'collectJob',
    payload: { carrierTenantId: 'carrier-1', jobId },
    requestId: 'r-collect',
  });
  await h.run('driver-1', {
    type: 'startTransit',
    payload: { carrierTenantId: 'carrier-1', jobId },
    requestId: 'r-transit',
  });
  return jobId;
}

const location = { lat: 53.4, lng: -2.29 };

describe('recordMotion', () => {
  it('records a stop, dated from when it began rather than when it was confirmed', async () => {
    const h = await makeHarness();
    const jobId = await jobInTransit(h);

    await h.run('driver-1', {
      type: 'recordMotion',
      payload: { carrierTenantId: 'carrier-1', jobId, moving: false, location, since: '2026-08-01T08:55:00.000Z' },
      requestId: 'r-stop',
    });

    const events = await h.store.query({
      collection: `jobs/${jobId}/events`,
      filters: [{ field: 'type', op: '==', value: 'job.stopped' }],
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toMatchObject({
      type: 'job.stopped',
      source: 'member',
      detail: { lat: 53.4, lng: -2.29, since: '2026-08-01T08:55:00.000Z' },
    });
  });

  it('records moving again as its own event', async () => {
    const h = await makeHarness();
    const jobId = await jobInTransit(h);

    await h.run('driver-1', {
      type: 'recordMotion',
      payload: { carrierTenantId: 'carrier-1', jobId, moving: true, location },
      requestId: 'r-go',
    });

    const events = await h.store.query({
      collection: `jobs/${jobId}/events`,
      filters: [{ field: 'type', op: '==', value: 'job.resumed' }],
    });
    expect(events).toHaveLength(1);
  });

  it('refuses a job that is not under way', async () => {
    // Nothing is moving before collection, and a delivered job is finished.
    const h = await makeHarness();
    const { loadId } = (await h.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload(),
      requestId: 'r-post',
    })) as { loadId: string };
    const { jobId } = (await h.run('driver-1', {
      type: 'acceptLoad',
      payload: { carrierTenantId: 'carrier-1', loadId },
      requestId: 'r-accept',
    })) as { jobId: string };

    await expectAppError(
      h.run('driver-1', {
        type: 'recordMotion',
        payload: { carrierTenantId: 'carrier-1', jobId, moving: false, location },
        requestId: 'r-stop',
      }),
      'conflict'
    );
  });

  it('refuses a driver who is not the one carrying it', async () => {
    const h = await makeHarness();
    const jobId = await jobInTransit(h);

    await expectAppError(
      h.run('driver-2', {
        type: 'recordMotion',
        payload: { carrierTenantId: 'carrier-1', jobId, moving: false, location },
        requestId: 'r-stop',
      }),
      'forbidden'
    );
  });

  it('is replayed rather than duplicated on a retry', async () => {
    // It rides the offline queue, so the same request can arrive twice.
    const h = await makeHarness();
    const jobId = await jobInTransit(h);
    const payload = { carrierTenantId: 'carrier-1', jobId, moving: false, location };

    await h.run('driver-1', { type: 'recordMotion', payload, requestId: 'r-same' });
    await h.run('driver-1', { type: 'recordMotion', payload, requestId: 'r-same' });

    const events = await h.store.query({
      collection: `jobs/${jobId}/events`,
      filters: [{ field: 'type', op: '==', value: 'job.stopped' }],
    });
    expect(events).toHaveLength(1);
  });
});
