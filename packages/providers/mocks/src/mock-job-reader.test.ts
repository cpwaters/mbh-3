import { describe, expect, it } from 'vitest';
import type { DriverJobView } from '@mbh/provider-interfaces';
import { MockJobReader } from './mock-job-reader.js';

const base = (over: Partial<DriverJobView & { driverActorId: string; deliveredAt: string }>) => ({
  jobId: 'job-1',
  driverActorId: 'driver-1',
  carrierTenantId: 'carrier-1',
  status: 'in_transit' as const,
  origin: { line1: '1 A St', town: 'Trafford', postcode: 'M17 1WS' },
  destination: { line1: '2 B St', town: 'Leith', postcode: 'EH6 6JJ' },
  priceGbpPence: 68000,
  ...over,
});

describe('MockJobReader', () => {
  it("returns the driver's active job without the internal driverActorId", async () => {
    const reader = new MockJobReader([base({})]);
    const job = await reader.activeJobForDriver('driver-1');
    expect(job).toMatchObject({ jobId: 'job-1', status: 'in_transit', origin: { town: 'Trafford' } });
    expect(job?.priceGbpPence).toBe(68000);
    expect(job).not.toHaveProperty('driverActorId');
  });

  it('returns null when the driver has no active job', async () => {
    const reader = new MockJobReader([base({ status: 'delivered' })]); // terminal
    expect(await reader.activeJobForDriver('driver-1')).toBeNull();
    expect(await reader.activeJobForDriver('someone-else')).toBeNull();
  });

  it('returns finished jobs newest-first, excluding active ones and other drivers', async () => {
    const reader = new MockJobReader([
      base({ jobId: 'active', status: 'in_transit' }),
      base({ jobId: 'old', status: 'delivered', priceGbpPence: 40000, deliveredAt: '2026-01-01T00:00:00.000Z' }),
      base({ jobId: 'new', status: 'closed', priceGbpPence: 70000, deliveredAt: '2026-03-01T00:00:00.000Z' }),
      base({ jobId: 'theirs', driverActorId: 'driver-2', status: 'delivered', deliveredAt: '2026-02-01T00:00:00.000Z' }),
    ]);
    const done = await reader.completedJobsForDriver('driver-1');
    expect(done.map((j) => j.jobId)).toEqual(['new', 'old']);
    expect(done[0]?.priceGbpPence).toBe(70000);
  });
});
