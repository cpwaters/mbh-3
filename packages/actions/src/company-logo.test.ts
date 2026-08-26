import { describe, expect, it } from 'vitest';
import { AppError, companyLogoStoragePath } from '@mbh/domain';
import { makeHarness } from './test-harness.js';

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

const logoRef = companyLogoStoragePath('carrier-1', 'req-1', 'image/png');

describe('setCompanyLogo', () => {
  it('records which object is the company logo', async () => {
    const h = await makeHarness();
    await h.run('car-owner', {
      type: 'setCompanyLogo',
      payload: { tenantId: 'carrier-1', logoRef, contentType: 'image/png' },
      requestId: 'r-1',
    });

    expect(await h.store.getDoc('tenants/carrier-1')).toMatchObject({
      logoRef,
      logoContentType: 'image/png',
    });
  });

  it('lets a driver set it, not just the owner', async () => {
    // A one-truck owner-driver is their own admin; gating branding behind a
    // role nobody in the company holds would just mean nobody sets it.
    const h = await makeHarness();
    await h.run('driver-1', {
      type: 'setCompanyLogo',
      payload: { tenantId: 'carrier-1', logoRef, contentType: 'image/png' },
      requestId: 'r-1',
    });

    expect(await h.store.getDoc('tenants/carrier-1')).toMatchObject({ logoRef });
  });

  it('refuses a stranger to the company, and a disabled member', async () => {
    const h = await makeHarness();
    const payload = { tenantId: 'carrier-1', logoRef, contentType: 'image/png' };

    await expectAppError(h.run('ship-owner', { type: 'setCompanyLogo', payload, requestId: 'r-1' }), 'forbidden');
    await expectAppError(
      h.run('driver-disabled', { type: 'setCompanyLogo', payload, requestId: 'r-2' }),
      'forbidden'
    );
  });

  it('refuses a ref pointing at another company’s object', async () => {
    // The storage rule already confines the upload, but this record is what
    // the drain downloads and puts on an invoice — so it is checked here too,
    // rather than trusting the client to send back what it wrote.
    const h = await makeHarness();
    const err = await expectAppError(
      h.run('car-owner', {
        type: 'setCompanyLogo',
        payload: {
          tenantId: 'carrier-1',
          logoRef: companyLogoStoragePath('shipper-1', 'req-1', 'image/png'),
          contentType: 'image/png',
        },
        requestId: 'r-1',
      }),
      'forbidden'
    );
    expect(err.message).toMatch(/does not belong to this company/i);
  });

  it('refuses a format the invoice cannot render', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run('car-owner', {
        type: 'setCompanyLogo',
        payload: { tenantId: 'carrier-1', logoRef: 'company-logos/carrier-1/req-1.svg', contentType: 'image/svg+xml' },
        requestId: 'r-1',
      }),
      'invalid-payload'
    );
  });

  it('leaves an audit trail naming the company and the object', async () => {
    const h = await makeHarness();
    await h.run('car-owner', {
      type: 'setCompanyLogo',
      payload: { tenantId: 'carrier-1', logoRef, contentType: 'image/png' },
      requestId: 'r-1',
    });

    const audit = await h.store.query({
      collection: 'audit',
      filters: [{ field: 'action', op: '==', value: 'setCompanyLogo' }],
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]?.data).toMatchObject({
      actorId: 'car-owner',
      source: 'member',
      tenantId: 'carrier-1',
      logoRef,
    });
  });
});

describe('clearCompanyLogo', () => {
  it('empties the logo so invoices fall back to the MyBackHaul mark', async () => {
    const h = await makeHarness();
    await h.run('car-owner', {
      type: 'setCompanyLogo',
      payload: { tenantId: 'carrier-1', logoRef, contentType: 'image/png' },
      requestId: 'r-1',
    });
    await h.run('car-owner', { type: 'clearCompanyLogo', payload: { tenantId: 'carrier-1' }, requestId: 'r-2' });

    expect(await h.store.getDoc('tenants/carrier-1')).toMatchObject({ logoRef: '', logoContentType: '' });
  });

  it('refuses a stranger to the company', async () => {
    const h = await makeHarness();
    await expectAppError(
      h.run('ship-owner', { type: 'clearCompanyLogo', payload: { tenantId: 'carrier-1' }, requestId: 'r-1' }),
      'forbidden'
    );
  });
});
