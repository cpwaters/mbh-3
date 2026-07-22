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

// Drive a fresh job to 'accepted' for driver-1 and return its ids.
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

const validPod = {
  photoRefs: ['storage://pod/photo-1.jpg'],
  signatureRef: 'storage://pod/sig-1.png',
  recipientName: 'J. Smith',
};

describe('job progression: collect -> in transit', () => {
  it('walks accepted -> collected -> in_transit with events', async () => {
    const h = await makeHarness();
    const { jobId } = await acceptedJob(h);

    const collected = await h.run('driver-1', {
      type: 'collectJob',
      payload: { carrierTenantId: 'carrier-1', jobId },
      requestId: 'r-collect',
    });
    expect(collected).toMatchObject({ status: 'collected' });
    expect(await h.store.getDoc(`jobs/${jobId}`)).toMatchObject({ status: 'collected' });

    const inTransit = await h.run('driver-1', {
      type: 'startTransit',
      payload: { carrierTenantId: 'carrier-1', jobId },
      requestId: 'r-transit',
    });
    expect(inTransit).toMatchObject({ status: 'in_transit' });
  });

  it('refuses skipping a state (accepted -> in_transit directly)', async () => {
    const h = await makeHarness();
    const { jobId } = await acceptedJob(h);
    await expectAppError(
      h.run('driver-1', { type: 'startTransit', payload: { carrierTenantId: 'carrier-1', jobId }, requestId: 'r-x' }),
      'conflict'
    );
  });

  it("refuses a driver acting on someone else's job", async () => {
    const h = await makeHarness();
    const { jobId } = await acceptedJob(h);
    await expectAppError(
      h.run('driver-2', { type: 'collectJob', payload: { carrierTenantId: 'carrier-1', jobId }, requestId: 'r-other' }),
      'forbidden'
    );
  });
});

describe('deliverJob — the atomic legal event', () => {
  async function jobInTransit(h: Harness): Promise<string> {
    const { jobId } = await acceptedJob(h);
    await h.run('driver-1', { type: 'collectJob', payload: { carrierTenantId: 'carrier-1', jobId }, requestId: `c-${jobId}` });
    await h.run('driver-1', { type: 'startTransit', payload: { carrierTenantId: 'carrier-1', jobId }, requestId: `t-${jobId}` });
    return jobId;
  }

  it('commits PoD evidence + delivered status + event together', async () => {
    const h = await makeHarness();
    const jobId = await jobInTransit(h);

    const result = (await h.run('driver-1', {
      type: 'deliverJob',
      payload: { carrierTenantId: 'carrier-1', jobId, ...validPod, location: { lat: 55.98, lng: -3.17 } },
      requestId: 'r-deliver',
    })) as { jobId: string; evidenceId: string };

    // Status changed.
    expect(await h.store.getDoc(`jobs/${jobId}`)).toMatchObject({ status: 'delivered', deliveredAt: expect.any(String) });
    // Evidence exists with the captured PoD.
    const evidence = await h.store.getDoc(`jobs/${jobId}/evidence/${result.evidenceId}`);
    expect(evidence).toMatchObject({
      kind: 'delivery',
      recipientName: 'J. Smith',
      signatureRef: 'storage://pod/sig-1.png',
      photoRefs: ['storage://pod/photo-1.jpg'],
      location: { lat: 55.98, lng: -3.17 },
    });
    // A delivered event references the evidence.
    const events = await h.store.query({ collection: `jobs/${jobId}/events` });
    expect(events.some((e) => e.data.type === 'job.delivered' && (e.data.detail as { evidenceId?: string })?.evidenceId === result.evidenceId)).toBe(true);
  });

  it('refuses a PoD missing the signature (nothing is written)', async () => {
    const h = await makeHarness();
    const jobId = await jobInTransit(h);
    const err = await expectAppError(
      h.run('driver-1', {
        type: 'deliverJob',
        payload: { carrierTenantId: 'carrier-1', jobId, photoRefs: ['storage://p.jpg'], signatureRef: '', recipientName: 'X' },
        requestId: 'r-nosig',
      }),
      'invalid-payload'
    );
    expect(err.field).toBe('signatureRef');
    expect(await h.store.getDoc(`jobs/${jobId}`)).toMatchObject({ status: 'in_transit' }); // unchanged
  });

  it('refuses a PoD with no photos', async () => {
    const h = await makeHarness();
    const jobId = await jobInTransit(h);
    const err = await expectAppError(
      h.run('driver-1', {
        type: 'deliverJob',
        payload: { carrierTenantId: 'carrier-1', jobId, photoRefs: [], signatureRef: 'sig', recipientName: 'X' },
        requestId: 'r-nophoto',
      }),
      'invalid-payload'
    );
    expect(err.field).toBe('photoRefs');
  });

  it('refuses delivering a job that is not yet in transit', async () => {
    const h = await makeHarness();
    const { jobId } = await acceptedJob(h); // still 'accepted'
    await expectAppError(
      h.run('driver-1', {
        type: 'deliverJob',
        payload: { carrierTenantId: 'carrier-1', jobId, ...validPod },
        requestId: 'r-early',
      }),
      'conflict'
    );
  });

  it('is idempotent — a replayed delivery returns the original evidence, writes once', async () => {
    const h = await makeHarness();
    const jobId = await jobInTransit(h);
    const first = (await h.run('driver-1', {
      type: 'deliverJob',
      payload: { carrierTenantId: 'carrier-1', jobId, ...validPod },
      requestId: 'r-idem',
    })) as { evidenceId: string };
    const replay = (await h.run('driver-1', {
      type: 'deliverJob',
      payload: { carrierTenantId: 'carrier-1', jobId, ...validPod, recipientName: 'Someone Else' },
      requestId: 'r-idem',
    })) as { evidenceId: string };
    expect(replay.evidenceId).toBe(first.evidenceId);
    const allEvidence = await h.store.query({ collection: `jobs/${jobId}/evidence` });
    expect(allEvidence).toHaveLength(1);
    expect(allEvidence[0]?.data.recipientName).toBe('J. Smith'); // original, not the replay's payload
  });
});
