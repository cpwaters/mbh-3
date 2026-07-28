import { z } from 'zod';
import {
  AppError,
  normalizeRegistration,
  validateVehicleInput,
  type Role,
  type Vehicle,
  type VehicleStatus,
} from '@mbh/domain';
import { vehicleDoc, vehiclesCollection } from '@mbh/paths';
import type { DocData } from '@mbh/provider-interfaces';
import type { ActionHandler } from '../context.js';
import { requireMember } from '../require-member.js';
import { requireTenantCapability } from '../require-capability.js';
import { zodParse } from '../parse.js';

// Fleet management. Any active member of a carrier tenant may manage its
// vehicles — owner-drivers add their own truck.
const FLEET_ROLES: readonly Role[] = ['owner', 'dispatcher', 'driver'];

const addVehicleSchema = z.object({
  carrierTenantId: z.string().min(1),
  registration: z.string().min(1),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int(),
  vin: z.string(),
  vehicleType: z.string().min(1),
  vehicleConfiguration: z.string().min(1),
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
    await requireTenantCapability(tx, payload.carrierTenantId, 'carrier');

    // The domain owns what a valid vehicle is (beyond the schema's shape).
    const check = validateVehicleInput({
      registration: payload.registration,
      make: payload.make,
      model: payload.model,
      year: payload.year,
      vehicleType: payload.vehicleType,
      vehicleConfiguration: payload.vehicleConfiguration,
    });
    if (!check.ok) {
      throw new AppError('invalid-payload', check.message, { field: check.field });
    }

    const registration = normalizeRegistration(payload.registration);
    // One active vehicle per plate in a fleet — checked against committed state.
    const existing = await tx.query({
      collection: vehiclesCollection(payload.carrierTenantId),
      filters: [{ field: 'registration', op: '==', value: registration }],
    });
    if (existing.some((row) => (row.data.status as VehicleStatus) === 'active')) {
      throw new AppError('conflict', 'That vehicle is already in your fleet.', { recoverable: false });
    }

    const vehicleId = ctx.newId('veh');
    const vehicle: Vehicle = {
      vehicleId,
      tenantId: payload.carrierTenantId,
      registration,
      make: payload.make.trim(),
      model: payload.model.trim(),
      year: payload.year,
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
      auditDetail: { vehicleId, tenantId: payload.carrierTenantId, registration },
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
    await requireTenantCapability(tx, payload.carrierTenantId, 'carrier');

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
