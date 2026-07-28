import type { Vehicle } from '@mbh/domain';
import type { VehicleReader } from '@mbh/provider-interfaces';

// Scriptable in-memory VehicleReader — the CI default. Returns a tenant's
// active vehicles, newest first.
export class MockVehicleReader implements VehicleReader {
  constructor(private readonly vehicles: Vehicle[] = []) {}

  async vehiclesForTenant(tenantId: string): Promise<Vehicle[]> {
    return this.vehicles
      .filter((v) => v.tenantId === tenantId && v.status === 'active')
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}
