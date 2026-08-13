import type { VehicleType, VehicleConfiguration } from './entities.js';

// A carrier's fleet: what a valid vehicle record requires. Registration is a
// UK number plate; type + configuration mirror the mbh-2 prototype's options.

export const VEHICLE_TYPES: readonly VehicleType[] = ['van', 'unit', 'trailer', 'rigid'];

export const VEHICLE_TYPE_LABELS: Readonly<Record<VehicleType, string>> = {
  van: 'Van',
  unit: 'Unit (Tractor)',
  trailer: 'Trailer',
  rigid: 'Rigid',
};

export const VEHICLE_CONFIGURATIONS: readonly VehicleConfiguration[] = [
  'refrigerated',
  'flatbed',
  'tanker',
  'curtain sider',
  'box',
  'skeleton',
];

export const VEHICLE_CONFIGURATION_LABELS: Readonly<Record<VehicleConfiguration, string>> = {
  refrigerated: 'Refrigerated',
  flatbed: 'Flatbed',
  tanker: 'Tanker',
  'curtain sider': 'Curtain Sider',
  box: 'Box',
  skeleton: 'Skeleton',
};

// Normalize a plate for storage + de-duplication: trim, uppercase, and collapse
// internal whitespace to single spaces.
export function normalizeRegistration(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, ' ');
}

export function isValidRegistration(raw: string): boolean {
  const reg = normalizeRegistration(raw);
  return reg.length >= 2 && reg.length <= 10;
}

export function isValidVehicleType(type: string): type is VehicleType {
  return (VEHICLE_TYPES as readonly string[]).includes(type);
}

export function isValidVehicleConfiguration(config: string): config is VehicleConfiguration {
  return (VEHICLE_CONFIGURATIONS as readonly string[]).includes(config);
}

export function isValidVehicleYear(year: number): boolean {
  return Number.isInteger(year) && year >= 1900 && year <= new Date().getFullYear() + 1;
}

export interface VehicleInput {
  registration: string;
  make: string;
  model: string;
  year: number;
  vehicleType: string;
  vehicleConfiguration: string;
}

export type VehicleCheck = { ok: true } | { ok: false; field: string; message: string };

// What each vehicle type actually needs, in the trade's terms:
//
// - A TRAILER has no engine and carries no DVLA registration of its own, so
//   make/model/year/registration are not asked for. What matters is its
//   configuration (curtain sider, tanker, ...).
// - A UNIT (tractor) is the opposite: it is identified by its plate and
//   make/model, and has no configuration of its own — the trailer it happens
//   to be pulling carries that.
// - Vans and rigids are one vehicle, so they need both.
//
// Exported so the form and the server enforce the SAME rule rather than
// drifting apart.
export function vehicleNeedsRegistrationDetails(vehicleType: string): boolean {
  return vehicleType !== 'trailer';
}

export function vehicleNeedsConfiguration(vehicleType: string): boolean {
  return vehicleType !== 'unit';
}

// The domain owns what a valid vehicle is — the action defends beyond the
// schema with this, mirroring validateDeliveryEvidence.
export function validateVehicleInput(input: VehicleInput): VehicleCheck {
  // Type first: everything below depends on which fields this type needs.
  if (!isValidVehicleType(input.vehicleType)) {
    return { ok: false, field: 'vehicleType', message: 'Choose a vehicle type.' };
  }

  if (vehicleNeedsRegistrationDetails(input.vehicleType)) {
    if (!isValidRegistration(input.registration)) {
      return { ok: false, field: 'registration', message: 'Enter a valid registration.' };
    }
    if (input.make.trim() === '') {
      return { ok: false, field: 'make', message: 'Enter the make.' };
    }
    if (input.model.trim() === '') {
      return { ok: false, field: 'model', message: 'Enter the model.' };
    }
    if (!isValidVehicleYear(input.year)) {
      return { ok: false, field: 'year', message: 'Enter a valid year.' };
    }
  }

  if (vehicleNeedsConfiguration(input.vehicleType)) {
    if (!isValidVehicleConfiguration(input.vehicleConfiguration)) {
      return { ok: false, field: 'vehicleConfiguration', message: 'Choose a configuration.' };
    }
  }

  return { ok: true };
}
