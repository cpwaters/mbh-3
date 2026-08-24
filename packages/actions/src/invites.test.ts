import { describe, expect, it } from 'vitest';
import { AppError, FOUNDER_EMAIL } from '@mbh/domain';
import { FIXED_NOW, makeHarness } from './test-harness.js';

const founder = { actorId: 'founder-1', email: FOUNDER_EMAIL };
// Same person, but the token carries no email — an identity provider that
// gives none must not pass for the founder.
const founderNoEmail = { actorId: 'founder-1', email: null };
const outsider = { actorId: 'someone', email: 'someone@example.test' };

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

const newCompany = (overrides: Record<string, unknown> = {}) => ({
  name: 'Waters Haulage',
  capabilities: ['carrier'],
  ...overrides,
});

async function mintInvite(h: Awaited<ReturnType<typeof makeHarness>>, requestId = 'r-mint'): Promise<string> {
  const { inviteId } = (await h.run(founder, {
    type: 'createInvite',
    payload: { note: 'Waters Haulage' },
    requestId,
  })) as { inviteId: string };
  return inviteId;
}

describe('createInvite — who may mint', () => {
  it('mints a pending invite that expires, for the founder', async () => {
    const h = await makeHarness();
    const result = (await h.run(founder, { type: 'createInvite', payload: { note: 'Waters' }, requestId: 'r-1' })) as {
      inviteId: string;
      expiresAt: string;
    };

    expect(await h.store.getDoc(`invites/${result.inviteId}`)).toMatchObject({
      status: 'pending',
      note: 'Waters',
      createdBy: 'founder-1',
      expiresAt: result.expiresAt,
    });
  });

  it('refuses anyone who is not the founder', async () => {
    const h = await makeHarness();
    await expectAppError(h.run(outsider, { type: 'createInvite', payload: {}, requestId: 'r-x' }), 'forbidden');
  });

  it('refuses a token with no email, rather than treating absent as a match', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run(founderNoEmail, { type: 'createInvite', payload: {}, requestId: 'r-none' }),
      'forbidden'
    );
  });

  it('is not fooled by a lookalike address', async () => {
    const h = await makeHarness();
    for (const email of [`${FOUNDER_EMAIL}.evil.test`, `x${FOUNDER_EMAIL}`, 'NVWEBDEVELOPERS@GMAIL.COM.attacker.test']) {
      await expectAppError(
        h.run({ actorId: 'imposter', email }, { type: 'createInvite', payload: {}, requestId: `r-${email}` }),
        'forbidden'
      );
    }
  });

  it('accepts the founder however their address is cased or spaced', async () => {
    const h = await makeHarness();
    await h.run(
      { actorId: 'founder-1', email: `  ${FOUNDER_EMAIL.toUpperCase()} ` },
      { type: 'createInvite', payload: {}, requestId: 'r-case' }
    );
    expect(await h.store.getDoc('invites/inv-1')).toMatchObject({ status: 'pending' });
  });

  it('keeps the link out of the audit trail, which more people can read', async () => {
    const h = await makeHarness();
    const { inviteId } = (await h.run(founder, {
      type: 'createInvite',
      payload: { note: 'Waters' },
      requestId: 'r-audit',
    })) as { inviteId: string };

    const audits = await h.store.query({ collection: 'audit', filters: [{ field: 'action', op: '==', value: 'createInvite' }] });
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits[0]?.data)).not.toContain(inviteId);
  });
});

describe('createInvite — a member invites a company in', () => {
  it('lets any active member of a company mint one, and records who did', async () => {
    const h = await makeHarness();
    for (const [actorId, tenantId, requestId] of [
      ['ship-owner', 'shipper-1', 'r-m1'],
      ['ship-dispatch', 'shipper-1', 'r-m2'],
      ['driver-1', 'carrier-1', 'r-m3'], // a driver counts too
    ] as const) {
      const { inviteId } = (await h.run(actorId, {
        type: 'createInvite',
        payload: { note: 'a mate', tenantId },
        requestId,
      })) as { inviteId: string };
      expect(await h.store.getDoc(`invites/${inviteId}`)).toMatchObject({
        status: 'pending',
        createdBy: actorId,
        createdByTenantId: tenantId,
      });
    }
  });

  it('refuses a company the actor is not a member of', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run('ship-owner', { type: 'createInvite', payload: { tenantId: 'carrier-1' }, requestId: 'r-wrong' }),
      'forbidden'
    );
  });

  it('refuses a disabled member', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run('driver-disabled', { type: 'createInvite', payload: { tenantId: 'carrier-1' }, requestId: 'r-dis' }),
      'forbidden'
    );
  });

  it('still refuses a stranger who names no company', async () => {
    const h = await makeHarness();
    await expectAppError(h.run(outsider, { type: 'createInvite', payload: {}, requestId: 'r-none' }), 'forbidden');
  });

  it('mints a link that really works — a member can bring a company in', async () => {
    const h = await makeHarness();
    const { inviteId } = (await h.run('ship-owner', {
      type: 'createInvite',
      payload: { tenantId: 'shipper-1' },
      requestId: 'r-chain',
    })) as { inviteId: string };

    const { tenantId } = (await h.run(outsider, {
      type: 'createTenant',
      payload: newCompany({ inviteId }),
      requestId: 'r-chain-join',
    })) as { tenantId: string };
    expect(await h.store.getDoc(`tenants/${tenantId}`)).toMatchObject({ name: 'Waters Haulage' });
    expect(await h.store.getDoc(`invites/${inviteId}`)).toMatchObject({ status: 'redeemed' });
  });
});

describe('createTenant — the marketplace is invitation-only', () => {
  it('refuses to create a company with no invitation', async () => {
    const h = await makeHarness();
    const err = await expectAppError(
      h.run(outsider, { type: 'createTenant', payload: newCompany(), requestId: 'r-no-inv' }),
      'forbidden'
    );
    expect(err.field).toBe('inviteId');
    expect(err.message).toMatch(/invitation/i);
  });

  it('creates the company and spends the invite in one go', async () => {
    const h = await makeHarness();
    const inviteId = await mintInvite(h);

    const { tenantId } = (await h.run(outsider, {
      type: 'createTenant',
      payload: newCompany({ inviteId }),
      requestId: 'r-join',
    })) as { tenantId: string };

    expect(await h.store.getDoc(`tenants/${tenantId}`)).toMatchObject({ name: 'Waters Haulage' });
    expect(await h.store.getDoc(`tenants/${tenantId}/members/someone`)).toMatchObject({ role: 'owner', status: 'active' });
    expect(await h.store.getDoc(`invites/${inviteId}`)).toMatchObject({
      status: 'redeemed',
      redeemedBy: 'someone',
      redeemedTenantId: tenantId,
    });
  });

  it('is one use: the second person to open the link is refused', async () => {
    const h = await makeHarness();
    const inviteId = await mintInvite(h);
    await h.run(outsider, { type: 'createTenant', payload: newCompany({ inviteId }), requestId: 'r-first' });

    const err = await expectAppError(
      h.run(
        { actorId: 'second-comer', email: 'second@example.test' },
        { type: 'createTenant', payload: newCompany({ name: 'Someone Else Ltd', inviteId }), requestId: 'r-second' }
      ),
      'conflict'
    );
    expect(err.message).toMatch(/already been used/i);
    expect(err.recoverable).toBe(false);
    // And nothing of the second company was written.
    expect(await h.store.getDoc('tenants/tenant-2')).toBeNull();
  });

  it('refuses a withdrawn invitation', async () => {
    const h = await makeHarness();
    const inviteId = await mintInvite(h);
    await h.run(founder, { type: 'revokeInvite', payload: { inviteId }, requestId: 'r-rev' });

    const err = await expectAppError(
      h.run(outsider, { type: 'createTenant', payload: newCompany({ inviteId }), requestId: 'r-revoked' }),
      'conflict'
    );
    expect(err.message).toMatch(/withdrawn/i);
  });

  it('refuses an invitation that has gone stale', async () => {
    const h = await makeHarness();
    // Seeded directly: the harness clock is fixed, so the only way to reach
    // an expired invite is to write one that was minted before it.
    const expiredAt = new Date(Date.parse(FIXED_NOW) - 1000).toISOString();
    await h.store.runBatch([
      {
        kind: 'create',
        path: 'invites/inv-stale',
        data: {
          inviteId: 'inv-stale',
          status: 'pending',
          note: 'sent a fortnight ago',
          createdAt: '2026-07-01T09:00:00.000Z',
          createdBy: 'founder-1',
          expiresAt: expiredAt,
        },
      },
    ]);

    const err = await expectAppError(
      h.run(outsider, { type: 'createTenant', payload: newCompany({ inviteId: 'inv-stale' }), requestId: 'r-stale' }),
      'conflict'
    );
    expect(err.message).toMatch(/expired/i);
    // Still pending, not quietly consumed by the failed attempt.
    expect(await h.store.getDoc('invites/inv-stale')).toMatchObject({ status: 'pending' });
  });

  it('refuses an invitation that does not exist', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run(outsider, { type: 'createTenant', payload: newCompany({ inviteId: 'inv-made-up' }), requestId: 'r-bogus' }),
      'not-found'
    );
  });

  it('lets the founder create a company without inviting themselves', async () => {
    const h = await makeHarness();
    const { tenantId } = (await h.run(founder, {
      type: 'createTenant',
      payload: newCompany({ name: 'MyBackHaul' }),
      requestId: 'r-founder',
    })) as { tenantId: string };
    expect(await h.store.getDoc(`tenants/${tenantId}`)).toMatchObject({ name: 'MyBackHaul' });
  });
});

describe('revokeInvite', () => {
  it('withdraws an unused invitation', async () => {
    const h = await makeHarness();
    const inviteId = await mintInvite(h);
    await h.run(founder, { type: 'revokeInvite', payload: { inviteId }, requestId: 'r-rev' });
    expect(await h.store.getDoc(`invites/${inviteId}`)).toMatchObject({ status: 'revoked' });
  });

  it('will not withdraw one that has been used — the company it made is already trading', async () => {
    const h = await makeHarness();
    const inviteId = await mintInvite(h);
    await h.run(outsider, { type: 'createTenant', payload: newCompany({ inviteId }), requestId: 'r-join' });

    await expectAppError(
      h.run(founder, { type: 'revokeInvite', payload: { inviteId }, requestId: 'r-late' }),
      'conflict'
    );
    expect(await h.store.getDoc(`invites/${inviteId}`)).toMatchObject({ status: 'redeemed' });
  });

  it('refuses anyone who is not the founder', async () => {
    const h = await makeHarness();
    const inviteId = await mintInvite(h);
    await expectAppError(
      h.run(outsider, { type: 'revokeInvite', payload: { inviteId }, requestId: 'r-x' }),
      'forbidden'
    );
    expect(await h.store.getDoc(`invites/${inviteId}`)).toMatchObject({ status: 'pending' });
  });
});
