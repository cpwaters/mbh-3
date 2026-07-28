import type { Vehicle } from '@mbh/domain';

// The carrier's read of their own fleet. Business reads go directly to the
// store (rules-gated), so this is a client-side READ interface.
export interface VehicleReader {
  // The carrier tenant's active vehicles, newest first.
  vehiclesForTenant(tenantId: string): Promise<Vehicle[]>;
}
