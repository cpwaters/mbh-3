import { describe, expect, it } from 'vitest';
import { makeHarness, validPostLoadPayload, type Harness } from './test-harness.js';

// The listing projection lifecycle through the real action layer.
describe('carrier listing projection', () => {
  it('postLoad publishes a safe listing alongside the private load', async () => {
    const harness = await makeHarness();
    const { loadId } = (await harness.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload(),
      requestId: 'r1',
    })) as { loadId: string };

    const listing = await harness.store.getDoc(`listings/${loadId}`);
    expect(listing).toMatchObject({
      loadId,
      shipperTenantId: 'shipper-1',
      origin: { town: 'Trafford', postcode: 'M17 1WS' },
      priceGbpPence: 68_000,
    });
    // The safe projection omits the raw street address.
    expect(JSON.stringify(listing)).not.toContain('Distribution Way');
  });

  it('acceptLoad removes the listing so a taken load is no longer browsable', async () => {
    const harness = await makeHarness();
    const { loadId } = (await harness.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload(),
      requestId: 'r1',
    })) as { loadId: string };
    expect(await harness.store.getDoc(`listings/${loadId}`)).not.toBeNull();

    await harness.run('driver-1', {
      type: 'acceptLoad',
      payload: { carrierTenantId: 'carrier-1', loadId },
      requestId: 'r2',
    });

    expect(await harness.store.getDoc(`listings/${loadId}`)).toBeNull();
    // The raw load remains, now matched.
    expect(await harness.store.getDoc(`loads/${loadId}`).then((l) => l?.status)).toBe('matched');
  });

  it('acceptLoad denormalizes the delivery details onto the job', async () => {
    const harness = await makeHarness();
    const { loadId } = (await harness.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload(),
      requestId: 'r1',
    })) as { loadId: string };
    const { jobId } = (await harness.run('driver-1', {
      type: 'acceptLoad',
      payload: { carrierTenantId: 'carrier-1', loadId },
      requestId: 'r2',
    })) as { jobId: string };

    // The driver's home reads these from the job (never the shipper-private load).
    const job = await harness.store.getDoc(`jobs/${jobId}`);
    expect(job).toMatchObject({
      origin: { town: 'Trafford', postcode: 'M17 1WS' },
      destination: { town: 'Leith', postcode: 'EH6 6JJ' },
    });
  });
});

describe('ADR (dangerous goods)', () => {
  it('carries the ADR flag from the posted load to the listing and the accepted job', async () => {
    const harness = await makeHarness();
    const { loadId } = (await harness.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload({
        consignment: { description: 'Paint, UN1263', weightKg: 8000, palletCount: 10, adrRequired: true },
      }),
      requestId: 'r-adr',
    })) as { loadId: string };

    expect(await harness.store.getDoc(`loads/${loadId}`)).toMatchObject({ consignment: { adrRequired: true } });
    expect(await harness.store.getDoc(`listings/${loadId}`)).toMatchObject({ adrRequired: true });

    await giveAdrCertificate(harness, 'driver-1', '2027-01-31');
    const { jobId } = (await harness.run('driver-1', {
      type: 'acceptLoad',
      payload: { carrierTenantId: 'carrier-1', loadId },
      requestId: 'r-acc',
    })) as { jobId: string };
    expect(await harness.store.getDoc(`jobs/${jobId}`)).toMatchObject({ adrRequired: true });
  });

  it('leaves an ordinary load unflagged, and stores nothing extra on it', async () => {
    const harness = await makeHarness();
    const { loadId } = (await harness.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload(),
      requestId: 'r-plain',
    })) as { loadId: string };
    expect((await harness.store.getDoc(`loads/${loadId}`))?.consignment).not.toHaveProperty('adrRequired');
    expect(await harness.store.getDoc(`listings/${loadId}`)).toMatchObject({ adrRequired: false });
  });

  it('refuses an ADR load to a driver with no ADR certificate, and leaves it on offer', async () => {
    const harness = await makeHarness();
    const loadId = await postAdrLoad(harness);
    await expect(
      harness.run('driver-1', {
        type: 'acceptLoad',
        payload: { carrierTenantId: 'carrier-1', loadId },
        requestId: 'r-acc-none',
      })
    ).rejects.toMatchObject({ code: 'forbidden', message: expect.stringMatching(/Add your ADR certificate/) });
    expect(await harness.store.getDoc(`loads/${loadId}`)).toMatchObject({ status: 'available' });
    expect(await harness.store.getDoc(`listings/${loadId}`)).not.toBeNull();
  });

  it('refuses an ADR load when the certificate has expired, saying when', async () => {
    const harness = await makeHarness();
    const loadId = await postAdrLoad(harness);
    // The harness clock is 1 August 2026.
    await giveAdrCertificate(harness, 'driver-1', '2026-07-31');
    await expect(
      harness.run('driver-1', {
        type: 'acceptLoad',
        payload: { carrierTenantId: 'carrier-1', loadId },
        requestId: 'r-acc-exp',
      })
    ).rejects.toMatchObject({ code: 'forbidden', message: expect.stringMatching(/expired on 31 July 2026/) });
  });

  it('accepts an ADR load on the last day of the certificate', async () => {
    const harness = await makeHarness();
    const loadId = await postAdrLoad(harness);
    await giveAdrCertificate(harness, 'driver-1', '2026-08-01');
    await expect(
      harness.run('driver-1', {
        type: 'acceptLoad',
        payload: { carrierTenantId: 'carrier-1', loadId },
        requestId: 'r-acc-last',
      })
    ).resolves.toHaveProperty('jobId');
  });

  it('lets a driver with no ADR certificate accept an ordinary load', async () => {
    const harness = await makeHarness();
    const { loadId } = (await harness.run('ship-owner', {
      type: 'postLoad',
      payload: validPostLoadPayload(),
      requestId: 'r-ord',
    })) as { loadId: string };
    await expect(
      harness.run('driver-1', {
        type: 'acceptLoad',
        payload: { carrierTenantId: 'carrier-1', loadId },
        requestId: 'r-acc-ord',
      })
    ).resolves.toHaveProperty('jobId');
  });
});

async function postAdrLoad(harness: Harness): Promise<string> {
  const { loadId } = (await harness.run('ship-owner', {
    type: 'postLoad',
    payload: validPostLoadPayload({
      consignment: { description: 'Paint, UN1263', weightKg: 8000, palletCount: 10, adrRequired: true },
    }),
    requestId: 'r-adr-post',
  })) as { loadId: string };
  return loadId;
}

async function giveAdrCertificate(harness: Harness, actorId: string, expiresOn: string): Promise<void> {
  await harness.run(actorId, {
    type: 'updateProfile',
    payload: {
      username: '',
      firstName: 'Chris',
      lastName: 'Waters',
      email: 'chris@example.com',
      dateOfBirth: '',
      companyName: '',
      companyRegistrationNumber: '',
      companyAddress: { street: '', town: '', city: '', postcode: '' },
      companyContact: { name: '', email: '', phone: '' },
      vatNumber: '',
      drivingLicenseNumber: '',
      adrCertificate: { number: 'ADR-123456', expiresOn },
      quantityOfVehicles: 0,
      paymentType: { invoiced: false, instantPayment: false },
      image: '',
    },
    requestId: `r-adr-cert-${expiresOn}`,
  });
}
