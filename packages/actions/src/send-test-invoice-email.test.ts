import { describe, expect, it } from 'vitest';
import { AppError } from '@mbh/domain';
import { makeHarness } from './test-harness.js';

describe('sendTestInvoiceEmail — founder debug tool', () => {
  it('enqueues an outbox task addressed to the actor\'s own profile email', async () => {
    const h = await makeHarness();
    await h.store.runBatch([
      { kind: 'create', path: 'userProfiles/ship-owner', data: { actorId: 'ship-owner', email: 'founder@mybackhaul.test' } },
    ]);

    const result = (await h.run('ship-owner', {
      type: 'sendTestInvoiceEmail',
      payload: { tenantId: 'shipper-1' },
      requestId: 'r-test-email',
    })) as { taskId: string };

    const task = await h.store.getDoc(`outbox/${result.taskId}`);
    expect(task).toMatchObject({
      type: 'sendTestInvoiceEmail',
      status: 'pending',
      tenantId: 'shipper-1',
      recipientEmail: 'founder@mybackhaul.test',
    });
  });

  it("refuses a non-member of the given tenant", async () => {
    const h = await makeHarness();
    await h.store.runBatch([
      { kind: 'create', path: 'userProfiles/driver-1', data: { actorId: 'driver-1', email: 'chris@waters.test' } },
    ]);

    try {
      await h.run('driver-1', {
        type: 'sendTestInvoiceEmail',
        payload: { tenantId: 'shipper-1' }, // driver-1 belongs to carrier-1, not shipper-1
        requestId: 'r-other-tenant',
      });
      throw new Error('expected a forbidden AppError');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('forbidden');
    }
  });

  it('refuses when the actor has no email on their profile', async () => {
    const h = await makeHarness();
    // No userProfiles/ship-owner document seeded at all.

    try {
      await h.run('ship-owner', {
        type: 'sendTestInvoiceEmail',
        payload: { tenantId: 'shipper-1' },
        requestId: 'r-no-email',
      });
      throw new Error('expected a conflict AppError');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('conflict');
    }
  });
});
