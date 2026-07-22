import { InMemoryDataStore } from '@mbh/provider-mocks';
import { buildRegistry, dispatch, type DispatchRequest } from './index.js';

// A deterministic id generator: per-prefix counters, so test assertions can
// name the ids the pipeline will mint (load-1, job-1, evt-1, audit-1, ...).
export function makeIdGen(): (prefix: string) => string {
  const counters = new Map<string, number>();
  return (prefix: string) => {
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}-${next}`;
  };
}

export const FIXED_NOW = '2026-08-01T09:00:00.000Z';

export interface Harness {
  store: InMemoryDataStore;
  run(actorId: string, request: DispatchRequest): Promise<Record<string, unknown>>;
}

export async function makeHarness(): Promise<Harness> {
  const store = new InMemoryDataStore();
  const registry = buildRegistry();

  // Two tenants and their members. Shipper: an owner + a dispatcher.
  // Carrier: an owner + a driver + a disabled driver.
  await store.runBatch([
    { kind: 'create', path: 'tenants/shipper-1', data: { tenantId: 'shipper-1', name: 'Acme', capabilities: ['shipper'] } },
    { kind: 'create', path: 'tenants/carrier-1', data: { tenantId: 'carrier-1', name: 'Waters Haulage', capabilities: ['carrier'] } },
    { kind: 'create', path: 'tenants/shipper-1/members/ship-owner', data: { tenantId: 'shipper-1', actorId: 'ship-owner', role: 'owner', status: 'active', displayName: 'Ship Owner' } },
    { kind: 'create', path: 'tenants/shipper-1/members/ship-dispatch', data: { tenantId: 'shipper-1', actorId: 'ship-dispatch', role: 'dispatcher', status: 'active', displayName: 'Ship Dispatcher' } },
    { kind: 'create', path: 'tenants/shipper-1/members/ship-driver', data: { tenantId: 'shipper-1', actorId: 'ship-driver', role: 'driver', status: 'active', displayName: 'Ship Driver' } },
    { kind: 'create', path: 'tenants/carrier-1/members/car-owner', data: { tenantId: 'carrier-1', actorId: 'car-owner', role: 'owner', status: 'active', displayName: 'Carrier Owner' } },
    { kind: 'create', path: 'tenants/carrier-1/members/driver-1', data: { tenantId: 'carrier-1', actorId: 'driver-1', role: 'driver', status: 'active', displayName: 'Chris Waters' } },
    { kind: 'create', path: 'tenants/carrier-1/members/driver-2', data: { tenantId: 'carrier-1', actorId: 'driver-2', role: 'driver', status: 'active', displayName: 'Second Driver' } },
    { kind: 'create', path: 'tenants/carrier-1/members/driver-disabled', data: { tenantId: 'carrier-1', actorId: 'driver-disabled', role: 'driver', status: 'disabled', displayName: 'Disabled Driver' } },
  ]);

  // One id generator for the whole harness so ids stay unique across
  // dispatches (like real uuids), while remaining deterministic.
  const newId = makeIdGen();
  const run = (actorId: string, request: DispatchRequest) =>
    dispatch({ store, now: FIXED_NOW, newId }, registry, actorId, request);

  return { store, run };
}

export function validPostLoadPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    shipperTenantId: 'shipper-1',
    origin: { line1: '10 Distribution Way', town: 'Trafford', postcode: 'M17 1WS' },
    destination: { line1: '5 Harbour Road', town: 'Leith', postcode: 'EH6 6JJ' },
    consignment: { description: 'Mixed pallets', weightKg: 14200, palletCount: 16 },
    priceGbpPence: 68_000,
    pickupBy: '2026-08-02',
    deliverBy: '2026-08-03',
    ...overrides,
  };
}
