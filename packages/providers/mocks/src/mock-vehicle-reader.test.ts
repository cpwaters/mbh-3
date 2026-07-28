import { describe, expect, it } from 'vitest';
import type { Vehicle } from '@mbh/domain';
import { MockVehicleReader } from './mock-vehicle-reader.js';

const veh = (over: Partial<Vehicle>): Vehicle => ({
  vehicleId: 'veh-1',
  tenantId: 'carrier-1',
  registration: 'AB12 CDE',
  type: 'artic',
  capacityKg: 26000,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'driver-1',
  ...over,
});

describe('MockVehicleReader', () => {
  it('returns a tenant’s active vehicles newest-first, excluding retired and other tenants', async () => {
    const reader = new MockVehicleReader([
      veh({ vehicleId: 'old', createdAt: '2026-01-01T00:00:00.000Z' }),
      veh({ vehicleId: 'new', createdAt: '2026-03-01T00:00:00.000Z' }),
      veh({ vehicleId: 'retired', status: 'retired', createdAt: '2026-04-01T00:00:00.000Z' }),
      veh({ vehicleId: 'theirs', tenantId: 'carrier-2' }),
    ]);
    const fleet = await reader.vehiclesForTenant('carrier-1');
    expect(fleet.map((v) => v.vehicleId)).toEqual(['new', 'old']);
  });
});
