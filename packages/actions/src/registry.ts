import type { AnyHandler } from './pipeline.js';
import { postLoadHandler } from './actions/post-load.js';
import { acceptLoadHandler } from './actions/accept-load.js';
import { collectJobHandler, startTransitHandler } from './actions/progress-job.js';
import { deliverJobHandler } from './actions/deliver-job.js';
import { relistJobHandler } from './actions/relist-job.js';
import { addVehicleHandler, retireVehicleHandler } from './actions/vehicles.js';
import { setCompanyLogoHandler, clearCompanyLogoHandler } from './actions/company-logo.js';
import { recordMotionHandler } from './actions/record-motion.js';
import { setJobTrackingHandler } from './actions/set-job-tracking.js';
import { setAdrCertificateHandler, updateProfileHandler } from './actions/update-profile.js';
import { setFeatureFlagHandler } from './actions/feature-flags.js';
import { shareLoadHandler } from './actions/share-load.js';
import { createTenantHandler } from './actions/create-tenant.js';
import { createInviteHandler, revokeInviteHandler } from './actions/invites.js';
import { cancelLoadHandler } from './actions/cancel-load.js';
import { recordRoutePointHandler } from './actions/record-route-point.js';
import { sendTestInvoiceEmailHandler } from './actions/send-test-invoice-email.js';
import {
  archiveAddressBookEntryHandler,
  saveAddressBookEntryHandler,
  updateAddressBookEntryHandler,
} from './actions/address-book.js';
import { backfillCloseJobsHandler } from './actions/backfill-close-jobs.js';
import { placeListingsHandler } from './actions/place-listings.js';
import {
  reinstateCompanyHandler,
  setCompanyTrackingHandler,
  setMemberTrackingHandler,
  setMemberRoleHandler,
  setMemberStatusHandler,
  suspendCompanyHandler,
} from './actions/founder-controls.js';
import { recordBillingEventHandler, setBillingConfigHandler, setCompanyPlanHandler } from './actions/billing.js';

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
  setAdrCertificateHandler,
  createTenantHandler,
  createInviteHandler,
  revokeInviteHandler,
  cancelLoadHandler,
  recordRoutePointHandler,
  sendTestInvoiceEmailHandler,
  backfillCloseJobsHandler,
  saveAddressBookEntryHandler,
  updateAddressBookEntryHandler,
  archiveAddressBookEntryHandler,
  setCompanyLogoHandler,
  clearCompanyLogoHandler,
  recordMotionHandler,
  setJobTrackingHandler,
  suspendCompanyHandler,
  reinstateCompanyHandler,
  setMemberStatusHandler,
  setMemberRoleHandler,
  recordBillingEventHandler,
  setBillingConfigHandler,
  setCompanyPlanHandler,
  setCompanyTrackingHandler,
  setMemberTrackingHandler,
  placeListingsHandler,
  setFeatureFlagHandler,
  shareLoadHandler,
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
  'setAdrCertificate',
  'createTenant',
  'cancelLoad',
  'recordRoutePoint',
  'sendTestInvoiceEmail',
  'backfillCloseJobs',
  'saveAddressBookEntry',
  'updateAddressBookEntry',
  'archiveAddressBookEntry',
  'createInvite',
  'revokeInvite',
  'setCompanyLogo',
  'clearCompanyLogo',
  'recordMotion',
  'setJobTracking',
  'suspendCompany',
  'reinstateCompany',
  'setMemberStatus',
  'setMemberRole',
  'recordBillingEvent',
  'setBillingConfig',
  'setCompanyPlan',
  'setCompanyTracking',
  'setMemberTracking',
  'placeListings',
  'setFeatureFlag',
  'shareLoad',
];

export const ALL_ACTION_TYPES: readonly string[] = HANDLERS.map((h) => h.type);
