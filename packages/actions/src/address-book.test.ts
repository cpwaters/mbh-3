import { describe, expect, it } from 'vitest';
import { AppError, type AddressBookEntry } from '@mbh/domain';
import { makeHarness, type Harness } from './test-harness.js';

function validEntry(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    shipperTenantId: 'shipper-1',
    label: 'Tesco Trafford DC',
    companyName: 'Tesco Distribution',
    line1: '10 Distribution Way',
    town: 'Trafford',
    postcode: 'M17 1WS',
    contactName: 'John Smith',
    contactEmail: 'john@tesco.test',
    contactPhone: '0161 234 5678',
    ...overrides,
  };
}

async function save(h: Harness, overrides: Record<string, unknown> = {}, requestId = `r-${Math.random()}`) {
  return (await h.run('ship-owner', {
    type: 'saveAddressBookEntry',
    payload: validEntry(overrides),
    requestId,
  })) as { entryId: string; created: boolean };
}

async function entries(h: Harness): Promise<AddressBookEntry[]> {
  const rows = await h.store.query({ collection: 'tenants/shipper-1/addressBook' });
  return rows.map((r) => r.data as unknown as AddressBookEntry);
}

describe('saveAddressBookEntry', () => {
  it('saves an entry under the shipper tenant, active and attributed', async () => {
    const h = await makeHarness();
    const result = await save(h);

    expect(result.created).toBe(true);
    const saved = await h.store.getDoc(`tenants/shipper-1/addressBook/${result.entryId}`);
    expect(saved).toMatchObject({
      entryId: result.entryId,
      tenantId: 'shipper-1',
      label: 'Tesco Trafford DC',
      line1: '10 Distribution Way',
      postcode: 'M17 1WS',
      contactEmail: 'john@tesco.test',
      status: 'active',
      createdBy: 'ship-owner',
    });
  });

  it('trims whitespace rather than storing it', async () => {
    const h = await makeHarness();
    const result = await save(h, { label: '  Depot  ', line1: ' 1 Dock Road ', postcode: ' BS11 8DL ' });
    expect(await h.store.getDoc(`tenants/shipper-1/addressBook/${result.entryId}`)).toMatchObject({
      label: 'Depot',
      line1: '1 Dock Road',
      postcode: 'BS11 8DL',
    });
  });

  it('reuses the existing entry when the same place is saved again, instead of stacking duplicates', async () => {
    const h = await makeHarness();
    const first = await save(h);
    // Same place, written differently, saved from a different load.
    const second = await save(h, { label: 'Tesco (Trafford)', line1: '10  distribution way', postcode: 'm17 1ws' });

    expect(second.created).toBe(false);
    expect(second.entryId).toBe(first.entryId);
    expect(await entries(h)).toHaveLength(1);
  });

  it('does treat a genuinely different address as a new entry', async () => {
    const h = await makeHarness();
    await save(h);
    const other = await save(h, { label: 'Asda Leith', line1: '5 Harbour Road', postcode: 'EH6 6JJ' });

    expect(other.created).toBe(true);
    expect(await entries(h)).toHaveLength(2);
  });

  it('refuses an entry with no label', async () => {
    const h = await makeHarness();
    try {
      await save(h, { label: '  ' });
      throw new Error('expected an invalid-payload AppError');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('invalid-payload');
      expect((err as AppError).field).toBe('label');
    }
  });

  it('refuses a driver of the tenant — curating the load form is owner/dispatcher work', async () => {
    const h = await makeHarness();
    try {
      await h.run('ship-driver', {
        type: 'saveAddressBookEntry',
        payload: validEntry(),
        requestId: 'r-driver',
      });
      throw new Error('expected a forbidden AppError');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('forbidden');
    }
  });

  it('refuses a non-member of the tenant', async () => {
    const h = await makeHarness();
    try {
      await h.run('driver-1', {
        type: 'saveAddressBookEntry',
        payload: validEntry(),
        requestId: 'r-outsider',
      });
      throw new Error('expected a forbidden AppError');
    } catch (err) {
      expect((err as AppError).code).toBe('forbidden');
    }
  });

  it('refuses a carrier tenant — an address book is a shipper concern', async () => {
    const h = await makeHarness();
    try {
      await h.run('car-owner', {
        type: 'saveAddressBookEntry',
        payload: validEntry({ shipperTenantId: 'carrier-1' }),
        requestId: 'r-carrier',
      });
      throw new Error('expected a forbidden AppError');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      // Same code postLoad uses when a carrier tries to post — capability
      // failures are 'forbidden', not 'conflict'.
      expect((err as AppError).code).toBe('forbidden');
    }
  });
});

describe('updateAddressBookEntry', () => {
  it('corrects an entry in place', async () => {
    const h = await makeHarness();
    const { entryId } = await save(h);

    await h.run('ship-owner', {
      type: 'updateAddressBookEntry',
      payload: validEntry({ entryId, label: 'Tesco Trafford (Gate 4)', contactName: 'Sarah Johnson' }),
      requestId: 'r-update',
    });

    expect(await h.store.getDoc(`tenants/shipper-1/addressBook/${entryId}`)).toMatchObject({
      entryId,
      label: 'Tesco Trafford (Gate 4)',
      contactName: 'Sarah Johnson',
      status: 'active',
    });
  });

  it('refuses to update an entry that does not exist', async () => {
    const h = await makeHarness();
    try {
      await h.run('ship-owner', {
        type: 'updateAddressBookEntry',
        payload: validEntry({ entryId: 'addr-nope' }),
        requestId: 'r-missing',
      });
      throw new Error('expected a not-found AppError');
    } catch (err) {
      expect((err as AppError).code).toBe('not-found');
    }
  });
});

describe('archiveAddressBookEntry', () => {
  it('archives rather than deletes, so a colleague mid-edit keeps their reference', async () => {
    const h = await makeHarness();
    const { entryId } = await save(h);

    await h.run('ship-owner', {
      type: 'archiveAddressBookEntry',
      payload: { shipperTenantId: 'shipper-1', entryId },
      requestId: 'r-archive',
    });

    const doc = await h.store.getDoc(`tenants/shipper-1/addressBook/${entryId}`);
    expect(doc).toMatchObject({ entryId, status: 'archived' });
    expect(await entries(h)).toHaveLength(1); // still there, just not offered
  });

  it('is safe to archive twice', async () => {
    const h = await makeHarness();
    const { entryId } = await save(h);
    const payload = { shipperTenantId: 'shipper-1', entryId };

    await h.run('ship-owner', { type: 'archiveAddressBookEntry', payload, requestId: 'r-a1' });
    await h.run('ship-owner', { type: 'archiveAddressBookEntry', payload, requestId: 'r-a2' });

    expect(await h.store.getDoc(`tenants/shipper-1/addressBook/${entryId}`)).toMatchObject({ status: 'archived' });
  });

  it('leaves an archived entry out of what the reader offers, but a new save of that place starts fresh', async () => {
    const h = await makeHarness();
    const first = await save(h);
    await h.run('ship-owner', {
      type: 'archiveAddressBookEntry',
      payload: { shipperTenantId: 'shipper-1', entryId: first.entryId },
      requestId: 'r-arch',
    });

    // Archiving was deliberate, so the archived row is NOT silently revived.
    const again = await save(h);
    expect(again.created).toBe(true);
    expect(again.entryId).not.toBe(first.entryId);
    expect(await entries(h)).toHaveLength(2);
  });
});
