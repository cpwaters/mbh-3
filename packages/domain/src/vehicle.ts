import type { VehicleType } from './entities.js';

// A carrier's fleet: what a valid vehicle record requires. Registration is a
// UK number plate; capacity is integer kilograms, bounded by the UK maximum
// gross vehicle weight.

export const VEHICLE_TYPES: readonly VehicleType[] = ['van', 'rigid', 'artic'];

// Human labels for the vehicle classes (UI + docs).
export const VEHICLE_TYPE_LABELS: Readonly<Record<VehicleType, string>> = {
  van: 'Van',
  rigid: 'Rigid',
  artic: 'Articulated',
};

// UK maximum gross vehicle weight is 44 tonnes.
export const MAX_VEHICLE_CAPACITY_KG = 44_000;

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

export function isValidCapacityKg(kg: number): boolean {
  return Number.isInteger(kg) && kg > 0 && kg <= MAX_VEHICLE_CAPACITY_KG;
}

export interface VehicleInput {
  registration: string;
  type: string;
  capacityKg: number;
}

export type VehicleCheck = { ok: true } | { ok: false; field: string; message: string };

// The domain owns what a valid vehicle is — the action defends beyond the
// schema with this, mirroring validateDeliveryEvidence.
export function validateVehicleInput(input: VehicleInput): VehicleCheck {
  if (!isValidRegistration(input.registration)) {
    return { ok: false, field: 'registration', message: 'Enter a valid registration.' };
  }
  if (!isValidVehicleType(input.type)) {
    return { ok: false, field: 'type', message: 'Choose a vehicle type.' };
  }
  if (!isValidCapacityKg(input.capacityKg)) {
    return { ok: false, field: 'capacityKg', message: 'Enter a capacity up to 44,000 kg.' };
  }
  return { ok: true };
}
