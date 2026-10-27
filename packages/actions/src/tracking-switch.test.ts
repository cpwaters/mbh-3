import { describe, expect, it } from 'vitest';
import { AppError, FOUNDER_EMAIL } from '@mbh/domain';
import { makeHarness, validPostLoadPayload, type Harness } from './test-harness.js';

const founder = { actorId: 'founder-1', email: FOUNDER_EMAIL };
const location = { lat: 53.4, lng: -2.29 };

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe(code);
    return;
  }
  throw new Error(`expected an AppError with code ${code}, but the call resolved`);
}

async function accept(h: Harness, driver = 'driver-1', suffix = ''): Promise<string> {
  const { loadId } = (await h.run('ship-owner', {
    type: 'postLoad',
    payload: validPostLoadPayload(),
    requestId: `r-post${suffix}`,
  })) as { loadId: string };
  const { jobId } = (await h.run(driver, {
    type: 'acceptLoad',
    payload: { carrierTenantId: 'carrier-1', loadId },
    requestId: `r-accept${suffix}`,
  })) as { jobId: string };
  return jobId;
}

async function collect(h: Harness, jobId: string, driver = 'driver-1'): Promise<void> {
  await h.run(driver, { type: 'collectJob', payload: { carrierTenantId: 'carrier-1', jobId }, requestId: `r-col-${jobId}` });
}

const routePoint = (h: Harness, jobId: string, requestId: string, driver = 'driver-1') =>
  h.run(driver, { type: 'recordRoutePoint', payload: { carrierTenantId: 'carrier-1', jobId, location }, requestId });

async function trailEvents(h: Harness, jobId: string): Promise<string[]> {
  const rows = await h.store.query({ collection: `jobs/${jobId}/events` });
  return rows.map((r) => r.data.type as string);
}

const companySwitch = (h: Harness, tenantId: string, enabled: boolean, requestId: string) =>
  h.run(founder, { type: 'setCompanyTracking', payload: { tenantId, enabled }, requestId });

const driverSwitch = (h: Harness, actorId: string, enabled: boolean, requestId: string) =>
  h.run(founder, { type: 'setMemberTracking', payload: { tenantId: 'carrier-1', actorId, enabled }, requestId });

describe('a job is tracked only while its shipper, carrier and driver all allow it', () => {
  it('marks a new job tracked when nobody has switched it off', async () => {
    const h = await makeHarness();
    const jobId = await accept(h);
    expect(await h.store.getDoc(`jobs/${jobId}`)).toMatchObject({ trackingAllowed: true });
  });

  it.each([
    ['the shipper', (h: Harness) => companySwitch(h, 'shipper-1', false, 'r-off')],
    ['the carrier', (h: Harness) => companySwitch(h, 'carrier-1', false, 'r-off')],
    ['the driver', (h: Harness) => driverSwitch(h, 'driver-1', false, 'r-off')],
  ])('marks a new job untracked when %s is switched off', async (_who, switchOff) => {
    const h = await makeHarness();
    await switchOff(h);
    const jobId = await accept(h);
    expect(await h.store.getDoc(`jobs/${jobId}`)).toMatchObject({ trackingAllowed: false });
  });

  it('switching a driver off stops a job already under way, and on again resumes it', async () => {
    const h = await makeHarness();
    const jobId = await accept(h);
    await collect(h, jobId);
    await routePoint(h, jobId, 'r-p1');

    const off = (await driverSwitch(h, 'driver-1', false, 'r-off')) as { jobsChanged: number };
    expect(off.jobsChanged).toBe(1);
    expect(await h.store.getDoc(`jobs/${jobId}`)).toMatchObject({ trackingAllowed: false });

    await driverSwitch(h, 'driver-1', true, 'r-on');
    expect(await h.store.getDoc(`jobs/${jobId}`)).toMatchObject({ trackingAllowed: true });
    expect(await h.store.getDoc('tenants/carrier-1/members/driver-1')).toMatchObject({ trackingDisabled: false });
  });

  it('turning one switch back on does not override another that is still off', async () => {
    const h = await makeHarness();
    const jobId = await accept(h);
    await companySwitch(h, 'shipper-1', false, 'r-ship-off');
    await driverSwitch(h, 'driver-1', false, 'r-drv-off');
    const res = (await driverSwitch(h, 'driver-1', true, 'r-drv-on')) as { jobsChanged: number };
    expect(res.jobsChanged).toBe(0);
    expect(await h.store.getDoc(`jobs/${jobId}`)).toMatchObject({ trackingAllowed: false });
  });

  it('switching a driver off touches only their jobs for that carrier', async () => {
    const h = await makeHarness();
    const mine = await accept(h, 'driver-1', '-a');
    const theirs = await accept(h, 'driver-2', '-b');
    await driverSwitch(h, 'driver-1', false, 'r-off');
    expect(await h.store.getDoc(`jobs/${mine}`)).toMatchObject({ trackingAllowed: false });
    expect(await h.store.getDoc(`jobs/${theirs}`)).toMatchObject({ trackingAllowed: true });
  });

  it('leaves a finished job as it was run', async () => {
    const h = await makeHarness();
    const jobId = await accept(h);
    await h.store.runBatch([{ kind: 'update', path: `jobs/${jobId}`, data: { status: 'delivered' } }]);
    const res = (await companySwitch(h, 'carrier-1', false, 'r-off')) as { jobsChanged: number };
    expect(res.jobsChanged).toBe(0);
    expect(await h.store.getDoc(`jobs/${jobId}`)).toMatchObject({ trackingAllowed: true });
  });
});

describe('a switched-off job stores no position', () => {
  it('accepts a queued point without recording it, so the driver sees no failed upload', async () => {
    const h = await makeHarness();
    const jobId = await accept(h);
    await collect(h, jobId);
    await driverSwitch(h, 'driver-1', false, 'r-off');

    const result = await routePoint(h, jobId, 'r-p1');
    expect(result).toEqual({ jobId, eventId: null, recorded: false });
    const stop = await h.run('driver-1', {
      type: 'recordMotion',
      payload: { carrierTenantId: 'carrier-1', jobId, moving: false, location },
      requestId: 'r-stop',
    });
    expect(stop).toMatchObject({ recorded: false });

    const types = await trailEvents(h, jobId);
    expect(types).not.toContain('job.routePoint');
    expect(types).not.toContain('job.stopped');
    // Not in the audit log either.
    const audit = await h.store.query({ collection: 'audit', filters: [{ field: 'action', op: '==', value: 'recordRoutePoint' }] });
    expect(audit[0]?.data).not.toHaveProperty('lat');
  });

  it('records again once it is switched back on', async () => {
    const h = await makeHarness();
    const jobId = await accept(h);
    await collect(h, jobId);
    await driverSwitch(h, 'driver-1', false, 'r-off');
    await driverSwitch(h, 'driver-1', true, 'r-on');
    expect(await routePoint(h, jobId, 'r-p1')).toMatchObject({ recorded: true });
    expect(await trailEvents(h, jobId)).toContain('job.routePoint');
  });
});

describe('the switches are the founder’s alone', () => {
  it('refuses an owner switching their own company or driver', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run('car-owner', { type: 'setCompanyTracking', payload: { tenantId: 'carrier-1', enabled: false }, requestId: 'r-1' }),
      'forbidden'
    );
    await expectAppError(
      h.run('car-owner', {
        type: 'setMemberTracking',
        payload: { tenantId: 'carrier-1', actorId: 'driver-1', enabled: false },
        requestId: 'r-2',
      }),
      'forbidden'
    );
  });

  it('refuses a member who does not exist rather than creating one', async () => {
    const h = await makeHarness();
    await expectAppError(driverSwitch(h, 'nobody', false, 'r-1'), 'not-found');
    expect(await h.store.getDoc('tenants/carrier-1/members/nobody')).toBeNull();
  });
});
