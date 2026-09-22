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

describe('setJobTracking', () => {
  it('records the pause as an event, so the gap in the trail is explained', async () => {
    // A silent gap is indistinguishable from lost signal or a closed app.
    // Recorded honestly, a pause is better evidence than a hole.
    const h = await makeHarness();
    const jobId = await jobInTransit(h);

    await h.run('driver-1', {
      type: 'setJobTracking',
      payload: { carrierTenantId: 'carrier-1', jobId, paused: true },
      requestId: 'r-pause',
    });

    const events = await h.store.query({
      collection: `jobs/${jobId}/events`,
      filters: [{ field: 'type', op: '==', value: 'job.trackingPaused' }],
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toMatchObject({ actorId: 'driver-1', source: 'member' });
  });

  it('records resuming as its own event', async () => {
    const h = await makeHarness();
    const jobId = await jobInTransit(h);

    await h.run('driver-1', {
      type: 'setJobTracking',
      payload: { carrierTenantId: 'carrier-1', jobId, paused: true },
      requestId: 'r-pause',
    });
    await h.run('driver-1', {
      type: 'setJobTracking',
      payload: { carrierTenantId: 'carrier-1', jobId, paused: false },
      requestId: 'r-resume',
    });

    const resumed = await h.store.query({
      collection: `jobs/${jobId}/events`,
      filters: [{ field: 'type', op: '==', value: 'job.trackingResumed' }],
    });
    expect(resumed).toHaveLength(1);
  });

  it('leaves the job status and its evidence alone', async () => {
    // Pausing hides the driver's position. It does not pause the JOB — they
    // are still carrying the load and still have to deliver it.
    const h = await makeHarness();
    const jobId = await jobInTransit(h);

    await h.run('driver-1', {
      type: 'setJobTracking',
      payload: { carrierTenantId: 'carrier-1', jobId, paused: true },
      requestId: 'r-pause',
    });

    expect(await h.store.getDoc(`jobs/${jobId}`)).toMatchObject({ status: 'in_transit' });
  });

  it('refuses another driver — you cannot switch off someone else’s journey', async () => {
    const h = await makeHarness();
    const jobId = await jobInTransit(h);

    await expectAppError(
      h.run('driver-2', {
        type: 'setJobTracking',
        payload: { carrierTenantId: 'carrier-1', jobId, paused: true },
        requestId: 'r-pause',
      }),
      'forbidden'
    );
  });

  it('refuses a job that is not under way', async () => {
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
        type: 'setJobTracking',
        payload: { carrierTenantId: 'carrier-1', jobId, paused: true },
        requestId: 'r-pause',
      }),
      'conflict'
    );
  });

  it('is replayed rather than duplicated on a retry', async () => {
    const h = await makeHarness();
    const jobId = await jobInTransit(h);
    const payload = { carrierTenantId: 'carrier-1', jobId, paused: true };

    await h.run('driver-1', { type: 'setJobTracking', payload, requestId: 'r-same' });
    await h.run('driver-1', { type: 'setJobTracking', payload, requestId: 'r-same' });

    const events = await h.store.query({
      collection: `jobs/${jobId}/events`,
      filters: [{ field: 'type', op: '==', value: 'job.trackingPaused' }],
    });
    expect(events).toHaveLength(1);
  });
});
