import { describe, expect, it } from 'vitest';
import { AppError } from '@mbh/domain';
import { makeHarness, validPostLoadPayload, type Harness } from './test-harness.js';

async function acceptedJob(h: Harness): Promise<{ loadId: string; jobId: string }> {
  const { loadId } = (await h.run('ship-owner', {
    type: 'postLoad',
    payload: validPostLoadPayload(),
    requestId: `post-${Math.random()}`,
  })) as { loadId: string };
  const { jobId } = (await h.run('driver-1', {
    type: 'acceptLoad',
    payload: { carrierTenantId: 'carrier-1', loadId },
    requestId: `accept-${Math.random()}`,
  })) as { jobId: string };
  return { loadId, jobId };
}

describe('relistJob — return an active job to the available pool', () => {
  it('drops the job and re-lists the load as available', async () => {
    const h = await makeHarness();
    const { loadId, jobId } = await acceptedJob(h);
    // After acceptance the load is matched and the listing is gone.
    expect(await h.store.getDoc(`loads/${loadId}`)).toMatchObject({ status: 'matched' });
    expect(await h.store.getDoc(`listings/${loadId}`)).toBeNull();

    const result = (await h.run('driver-1', {
      type: 'relistJob',
      payload: { carrierTenantId: 'carrier-1', jobId },
      requestId: 'r-relist',
    })) as { loadId: string };
    expect(result.loadId).toBe(loadId);

    // Load is available again, the browse projection is back, the job is gone.
    expect(await h.store.getDoc(`loads/${loadId}`)).toMatchObject({ status: 'available' });
    expect(await h.store.getDoc(`listings/${loadId}`)).not.toBeNull();
    expect(await h.store.getDoc(`jobs/${jobId}`)).toBeNull();
    // A relisted event is recorded.
    const events = await h.store.query({ collection: `jobs/${jobId}/events` });
    expect(events.some((e) => e.data.type === 'job.relisted')).toBe(true);
  });

  it("refuses a driver relisting someone else's job", async () => {
    const h = await makeHarness();
    const { jobId } = await acceptedJob(h);
    try {
      await h.run('driver-2', {
        type: 'relistJob',
        payload: { carrierTenantId: 'carrier-1', jobId },
        requestId: 'r-other',
      });
      throw new Error('expected a forbidden AppError');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('forbidden');
    }
  });
});
