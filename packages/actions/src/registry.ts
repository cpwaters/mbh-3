import type { AnyHandler } from './pipeline.js';
import { postLoadHandler } from './actions/post-load.js';
import { acceptLoadHandler } from './actions/accept-load.js';
import { collectJobHandler, startTransitHandler } from './actions/progress-job.js';
import { deliverJobHandler } from './actions/deliver-job.js';
import { relistJobHandler } from './actions/relist-job.js';
import { addVehicleHandler, retireVehicleHandler } from './actions/vehicles.js';
import { updateProfileHandler } from './actions/update-profile.js';
import { createTenantHandler } from './actions/create-tenant.js';
import { cancelLoadHandler } from './actions/cancel-load.js';
import { recordRoutePointHandler } from './actions/record-route-point.js';
import { sendTestInvoiceEmailHandler } from './actions/send-test-invoice-email.js';

// Every action the dispatch function can run. Adding an action means adding
// it here — nothing else discovers handlers.
const HANDLERS: readonly AnyHandler[] = [
  postLoadHandler,
  acceptLoadHandler,
  collectJobHandler,
  startTransitHandler,
  deliverJobHandler,
  relistJobHandler,
  addVehicleHandler,
  retireVehicleHandler,
  updateProfileHandler,
  createTenantHandler,
  cancelLoadHandler,
  recordRoutePointHandler,
  sendTestInvoiceEmailHandler,
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
  'relistJob',
  'addVehicle',
  'retireVehicle',
  'updateProfile',
  'createTenant',
  'cancelLoad',
  'recordRoutePoint',
  'sendTestInvoiceEmail',
];

export const ALL_ACTION_TYPES: readonly string[] = HANDLERS.map((h) => h.type);
