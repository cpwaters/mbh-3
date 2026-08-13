import { z } from 'zod';
import {
  AppError,
  normalizeRegistration,
  normalizeTrailerNumber,
  validateVehicleInput,
  type Role,
  type Vehicle,
  type VehicleStatus,
} from '@mbh/domain';
import { vehicleDoc, vehiclesCollection } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireMember } from '../require-member.js';
import { requireAnyTenantCapability } from '../require-capability.js';
import { zodParse } from '../parse.js';

// Fleet management. Any active member of the owning tenant may manage its
// vehicles — owner-drivers add their own truck.
const FLEET_ROLES: readonly Role[] = ['owner', 'dispatcher', 'driver'];

// A fleet is a company's, not a marketplace side's: shippers run their own
// vehicles and trailers too. Either capability may keep one.
const FLEET_CAPABILITIES = ['carrier', 'shipper'] as const;

// Only the tenant and the type are structurally required: which of the rest
// a vehicle actually needs depends on that type (a trailer has no plate or
// make; a unit has no configuration), and validateVehicleInput owns that
// rule. The schema stays permissive so the domain can give the precise,
// field-attributed error instead of a generic shape failure.
const addVehicleSchema = z.object({
  // The tenant whose fleet this is — a carrier's or a shipper's. Named for
  // the carrier case it was built for; kept so existing clients keep working.
  carrierTenantId: z.string().min(1),
  registration: z.string(),
  make: z.string(),
  model: z.string(),
  year: z.number().int(),
  trailerNumber: z.string().optional(),
  vin: z.string(),
  vehicleType: z.string().min(1),
  vehicleConfiguration: z.string(),
});

export type AddVehiclePayload = z.infer<typeof addVehicleSchema>;

export interface AddVehicleResult extends DocData {
  vehicleId: string;
}

export const addVehicleHandler: ActionHandler<AddVehiclePayload, AddVehicleResult> = {
  type: 'addVehicle',
  idempotent: true,
  parse: zodParse(addVehicleSchema),
  async execute(tx, ctx, payload) {
    await requireMember(tx, payload.carrierTenantId, ctx.actorId, FLEET_ROLES);
    await requireAnyTenantCapability(tx, payload.carrierTenantId, FLEET_CAPABILITIES);

    // The domain owns what a valid vehicle is (beyond the schema's shape).
    const check = validateVehicleInput({
      registration: payload.registration,
      make: payload.make,
      model: payload.model,
      year: payload.year,
      trailerNumber: payload.trailerNumber ?? '',
      vehicleType: payload.vehicleType,
      vehicleConfiguration: payload.vehicleConfiguration,
    });
    if (!check.ok) {
      throw new AppError('invalid-payload', check.message, { field: check.field });
    }

    const registration = normalizeRegistration(payload.registration);
    const trailerNumber = normalizeTrailerNumber(payload.trailerNumber ?? '');
    // One active vehicle per identifier in a fleet — checked against committed
    // state. Which field identifies it depends on the type: a plate for
    // anything that carries one, the fleet number for a trailer (which does
    // not). Skipped entirely if neither is set, so an unidentified vehicle
    // can't collide with every other unidentified one.
    const identifier =
      registration !== ''
        ? { field: 'registration', value: registration }
        : trailerNumber !== ''
          ? { field: 'trailerNumber', value: trailerNumber }
          : null;
    if (identifier !== null) {
      const existing = await tx.query({
        collection: vehiclesCollection(payload.carrierTenantId),
        filters: [{ field: identifier.field, op: '==', value: identifier.value }],
      });
      if (existing.some((row) => (row.data.status as VehicleStatus) === 'active')) {
        throw new AppError('conflict', 'That vehicle is already in your fleet.', { recoverable: false });
      }
    }

    const vehicleId = ctx.newId('veh');
    const vehicle: Vehicle = {
      vehicleId,
      tenantId: payload.carrierTenantId,
      registration,
      make: payload.make.trim(),
      model: payload.model.trim(),
      year: payload.year,
      trailerNumber,
      vin: payload.vin.trim(),
      vehicleType: payload.vehicleType as Vehicle['vehicleType'],
      vehicleConfiguration: payload.vehicleConfiguration as Vehicle['vehicleConfiguration'],
      status: 'active',
      createdAt: ctx.now,
      createdBy: ctx.actorId,
    };
    tx.write({ kind: 'create', path: vehicleDoc(payload.carrierTenantId, vehicleId), data: { ...vehicle } });

    return {
      result: { vehicleId },
      auditDetail: { vehicleId, tenantId: payload.carrierTenantId, registration, trailerNumber },
    };
  },
};

const retireVehicleSchema = z.object({
  carrierTenantId: z.string().min(1),
  vehicleId: z.string().min(1),
});

export type RetireVehiclePayload = z.infer<typeof retireVehicleSchema>;

export interface RetireVehicleResult extends DocData {
  vehicleId: string;
}

// Retire, never delete — the fleet record survives. Setting status is
// idempotent, so a retry (or retiring an already-retired vehicle) is safe.
export const retireVehicleHandler: ActionHandler<RetireVehiclePayload, RetireVehicleResult> = {
  type: 'retireVehicle',
  idempotent: true,
  parse: zodParse(retireVehicleSchema),
  async execute(tx, ctx, payload) {
    await requireMember(tx, payload.carrierTenantId, ctx.actorId, FLEET_ROLES);
    await requireAnyTenantCapability(tx, payload.carrierTenantId, FLEET_CAPABILITIES);

    const path = vehicleDoc(payload.carrierTenantId, payload.vehicleId);
    const data = await tx.get(path);
    if (data === null) {
      throw new AppError('not-found', 'That vehicle no longer exists.');
    }
    tx.write({ kind: 'update', path, data: { status: 'retired' satisfies VehicleStatus } });

    return {
      result: { vehicleId: payload.vehicleId },
      auditDetail: { vehicleId: payload.vehicleId, tenantId: payload.carrierTenantId },
    };
  },
};
