import { describe, expect, it } from 'vitest';
import type { DriverJobView } from '@mbh/provider-interfaces';
import { MockJobReader } from './mock-job-reader.js';

const base = (over: Partial<DriverJobView & { driverActorId: string }>) => ({
  jobId: 'job-1',
  driverActorId: 'driver-1',
  carrierTenantId: 'carrier-1',
  status: 'in_transit' as const,
  origin: { line1: '1 A St', town: 'Trafford', postcode: 'M17 1WS' },
  destination: { line1: '2 B St', town: 'Leith', postcode: 'EH6 6JJ' },
  ...over,
});

describe('MockJobReader', () => {
  it("returns the driver's active job without the internal driverActorId", async () => {
    const reader = new MockJobReader([base({})]);
    const job = await reader.activeJobForDriver('driver-1');
    expect(job).toMatchObject({ jobId: 'job-1', status: 'in_transit', origin: { town: 'Trafford' } });
    expect(job).not.toHaveProperty('driverActorId');
  });

  it('returns null when the driver has no active job', async () => {
    const reader = new MockJobReader([base({ status: 'delivered' })]); // terminal
    expect(await reader.activeJobForDriver('driver-1')).toBeNull();
    expect(await reader.activeJobForDriver('someone-else')).toBeNull();
  });
});
