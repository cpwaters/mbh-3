import type { AnyHandler } from './pipeline.js';
import { postLoadHandler } from './actions/post-load.js';
import { acceptLoadHandler } from './actions/accept-load.js';
import { collectJobHandler, startTransitHandler } from './actions/progress-job.js';
import { deliverJobHandler } from './actions/deliver-job.js';
import { addVehicleHandler, retireVehicleHandler } from './actions/vehicles.js';
import { updateProfileHandler } from './actions/update-profile.js';
import { createTenantHandler } from './actions/create-tenant.js';
import { cancelLoadHandler } from './actions/cancel-load.js';

// Every action the dispatch function can run. Adding an action means adding
// it here — nothing else discovers handlers.
const HANDLERS: readonly AnyHandler[] = [
  postLoadHandler,
  acceptLoadHandler,
  collectJobHandler,
  startTransitHandler,
  deliverJobHandler,
  addVehicleHandler,
  retireVehicleHandler,
  updateProfileHandler,
  createTenantHandler,
  cancelLoadHandler,
];

export function buildRegistry(): ReadonlyMap<string, AnyHandler> {
  const map = new Map<string, AnyHandler>();
  for (const handler of HANDLERS) {
    if (map.has(handler.type)) {
      throw new Error(`Duplicate action type in registry: ${handler.type}`);
    }
    map.set(handler.type, handler);
  }
  return map;
}

// The pinned set of idempotent (offline-retriable) action types. A test
// asserts the registry matches this exactly, so making an action idempotent
// (or not) is a deliberate, reviewed change — never an accident.
export const IDEMPOTENT_ACTION_TYPES: readonly string[] = [
  'postLoad',
  'acceptLoad',
  'collectJob',
  'startTransit',
  'deliverJob',
  'addVehicle',
  'retireVehicle',
  'updateProfile',
  'createTenant',
  'cancelLoad',
];

export const ALL_ACTION_TYPES: readonly string[] = HANDLERS.map((h) => h.type);
