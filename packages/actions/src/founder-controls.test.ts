import { describe, expect, it } from 'vitest';
import { AppError, FOUNDER_EMAIL } from '@mbh/domain';
import { makeHarness, validPostLoadPayload, type Harness } from './test-harness.js';

const founder = { actorId: 'founder-1', email: FOUNDER_EMAIL };
// An owner of a real company, so "only the founder" is tested against the
// most-privileged ordinary user rather than a stranger.
const owner = { actorId: 'ship-owner', email: 'owner@acme.test' };

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

async function postLoad(h: Harness, requestId: string): Promise<string> {
  const { loadId } = (await h.run('ship-owner', {
    type: 'postLoad',
    payload: validPostLoadPayload(),
    requestId,
  })) as { loadId: string };
  return loadId;
}

const suspend = (h: Harness, requestId = 'r-suspend', actor: typeof founder = founder) =>
  h.run(actor, { type: 'suspendCompany', payload: { tenantId: 'shipper-1', reason: 'Unpaid invoices' }, requestId });

describe('suspendCompany', () => {
  it('is the founder’s alone, even against an owner of the company', async () => {
    const h = await makeHarness();
    await expectAppError(suspend(h, 'r-x', owner), 'forbidden');
    expect(await h.store.getDoc('tenants/shipper-1')).not.toHaveProperty('status');
  });

  it('marks the company suspended, with the reason, and audits who did it', async () => {
    const h = await makeHarness();
    await suspend(h);
    expect(await h.store.getDoc('tenants/shipper-1')).toMatchObject({
      status: 'suspended',
      suspendedReason: 'Unpaid invoices',
    });
    const audit = await h.store.query({ collection: 'audit', filters: [{ field: 'action', op: '==', value: 'suspendCompany' }] });
    expect(audit[0]?.data).toMatchObject({ actorId: 'founder-1', tenantId: 'shipper-1', reason: 'Unpaid invoices' });
  });

  it('wants a reason, since the company will be shown it', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run(founder, { type: 'suspendCompany', payload: { tenantId: 'shipper-1', reason: ' ' }, requestId: 'r-1' }),
      'invalid-payload'
    );
  });

  it('withdraws the company’s available loads from the browse', async () => {
    const h = await makeHarness();
    const loadId = await postLoad(h, 'r-post');
    expect(await h.store.getDoc(`listings/${loadId}`)).not.toBeNull();

    const result = (await suspend(h)) as { withdrawnLoads: number };
    expect(result.withdrawnLoads).toBe(1);
    expect(await h.store.getDoc(`listings/${loadId}`)).toBeNull();
    // The load itself is untouched — it is hidden, not cancelled.
    expect(await h.store.getDoc(`loads/${loadId}`)).toMatchObject({ status: 'available' });
  });

  it('stops every member acting, and tells them why', async () => {
    const h = await makeHarness();
    await suspend(h);
    const err = await expectAppError(
      h.run('ship-owner', { type: 'postLoad', payload: validPostLoadPayload(), requestId: 'r-post' }),
      'forbidden'
    );
    expect(err.message).toMatch(/suspended \(Unpaid invoices\)/);
  });

  it('refuses a carrier accepting a suspended shipper’s load from a stale browse', async () => {
    const h = await makeHarness();
    const loadId = await postLoad(h, 'r-post');
    await suspend(h);
    await expectAppError(
      h.run('driver-1', { type: 'acceptLoad', payload: { carrierTenantId: 'carrier-1', loadId }, requestId: 'r-acc' }),
      'conflict'
    );
  });

  it('does not touch other companies', async () => {
    const h = await makeHarness();
    await h.run(founder, {
      type: 'suspendCompany',
      payload: { tenantId: 'carrier-1', reason: 'Insurance lapsed' },
      requestId: 'r-s',
    });
    await expect(postLoad(h, 'r-post')).resolves.toBeTruthy();
  });

  it('refuses a company that does not exist', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run(founder, { type: 'suspendCompany', payload: { tenantId: 'nope', reason: 'Test reason' }, requestId: 'r-1' }),
      'not-found'
    );
  });
});

describe('reinstateCompany', () => {
  it('lets members act again and puts the still-available loads back on the browse', async () => {
    const h = await makeHarness();
    const loadId = await postLoad(h, 'r-post');
    await suspend(h);

    const result = (await h.run(founder, {
      type: 'reinstateCompany',
      payload: { tenantId: 'shipper-1' },
      requestId: 'r-reinstate',
    })) as { relistedLoads: number };

    expect(result.relistedLoads).toBe(1);
    expect(await h.store.getDoc('tenants/shipper-1')).toMatchObject({ status: 'active' });
    expect(await h.store.getDoc(`listings/${loadId}`)).toMatchObject({ loadId });
    await expect(postLoad(h, 'r-post-2')).resolves.toBeTruthy();
  });

  it('is a no-op on a company that is not suspended', async () => {
    const h = await makeHarness();
    const result = (await h.run(founder, {
      type: 'reinstateCompany',
      payload: { tenantId: 'shipper-1' },
      requestId: 'r-1',
    })) as { relistedLoads: number };
    expect(result.relistedLoads).toBe(0);
  });

  it('is the founder’s alone', async () => {
    const h = await makeHarness();
    await suspend(h);
    await expectAppError(
      h.run(owner, { type: 'reinstateCompany', payload: { tenantId: 'shipper-1' }, requestId: 'r-1' }),
      'forbidden'
    );
  });
});

describe('setMemberStatus / setMemberRole', () => {
  it('disables a member, who can then no longer act, and re-enables them', async () => {
    const h = await makeHarness();
    await h.run(founder, {
      type: 'setMemberStatus',
      payload: { tenantId: 'shipper-1', actorId: 'ship-dispatch', status: 'disabled' },
      requestId: 'r-1',
    });
    await expectAppError(
      h.run('ship-dispatch', { type: 'postLoad', payload: validPostLoadPayload(), requestId: 'r-post' }),
      'forbidden'
    );

    await h.run(founder, {
      type: 'setMemberStatus',
      payload: { tenantId: 'shipper-1', actorId: 'ship-dispatch', status: 'active' },
      requestId: 'r-2',
    });
    await expect(
      h.run('ship-dispatch', { type: 'postLoad', payload: validPostLoadPayload(), requestId: 'r-post-2' })
    ).resolves.toBeTruthy();
  });

  it('changes a role, and the new role is what the next action is judged by', async () => {
    const h = await makeHarness();
    // A shipper's driver may not post loads…
    await expectAppError(
      h.run('ship-driver', { type: 'postLoad', payload: validPostLoadPayload(), requestId: 'r-post' }),
      'forbidden'
    );
    await h.run(founder, {
      type: 'setMemberRole',
      payload: { tenantId: 'shipper-1', actorId: 'ship-driver', role: 'dispatcher' },
      requestId: 'r-role',
    });
    // …and as a dispatcher, may.
    await expect(
      h.run('ship-driver', { type: 'postLoad', payload: validPostLoadPayload(), requestId: 'r-post-2' })
    ).resolves.toBeTruthy();
    expect(await h.store.getDoc('tenants/shipper-1/members/ship-driver')).toMatchObject({ role: 'dispatcher' });
  });

  it('refuses a member who does not exist rather than creating one', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run(founder, {
        type: 'setMemberRole',
        payload: { tenantId: 'shipper-1', actorId: 'nobody', role: 'owner' },
        requestId: 'r-1',
      }),
      'not-found'
    );
    expect(await h.store.getDoc('tenants/shipper-1/members/nobody')).toBeNull();
  });

  it('is the founder’s alone — an owner cannot promote or disable through this', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run(owner, {
        type: 'setMemberStatus',
        payload: { tenantId: 'shipper-1', actorId: 'ship-dispatch', status: 'disabled' },
        requestId: 'r-1',
      }),
      'forbidden'
    );
    await expectAppError(
      h.run(owner, {
        type: 'setMemberRole',
        payload: { tenantId: 'shipper-1', actorId: 'ship-driver', role: 'owner' },
        requestId: 'r-2',
      }),
      'forbidden'
    );
  });
});

describe('cancelLoad by the founder', () => {
  it('withdraws any company’s available load without being a member of it', async () => {
    const h = await makeHarness();
    const loadId = await postLoad(h, 'r-post');
    await h.run(founder, {
      type: 'cancelLoad',
      payload: { shipperTenantId: 'shipper-1', loadId },
      requestId: 'r-cancel',
    });
    expect(await h.store.getDoc(`loads/${loadId}`)).toMatchObject({ status: 'cancelled' });
    expect(await h.store.getDoc(`listings/${loadId}`)).toBeNull();
  });

  it('still checks the load belongs to the company named', async () => {
    const h = await makeHarness();
    const loadId = await postLoad(h, 'r-post');
    await expectAppError(
      h.run(founder, { type: 'cancelLoad', payload: { shipperTenantId: 'carrier-1', loadId }, requestId: 'r-c' }),
      'forbidden'
    );
  });
});
