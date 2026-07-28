import { describe, expect, it } from 'vitest';
import {
  MAX_VEHICLE_CAPACITY_KG,
  normalizeRegistration,
  validateVehicleInput,
} from './vehicle.js';

describe('vehicle', () => {
  it('normalizes a registration: trim, uppercase, collapse whitespace', () => {
    expect(normalizeRegistration('  ab12   cde ')).toBe('AB12 CDE');
    expect(normalizeRegistration('ab12cde')).toBe('AB12CDE');
  });

  it('accepts a valid vehicle', () => {
    expect(validateVehicleInput({ registration: 'AB12 CDE', type: 'artic', capacityKg: 26000 })).toEqual({
      ok: true,
    });
  });

  it('rejects a bad registration, type, and capacity with the offending field', () => {
    expect(validateVehicleInput({ registration: 'A', type: 'artic', capacityKg: 100 })).toMatchObject({
      ok: false,
      field: 'registration',
    });
    expect(validateVehicleInput({ registration: 'AB12 CDE', type: 'jet', capacityKg: 100 })).toMatchObject({
      ok: false,
      field: 'type',
    });
    expect(
      validateVehicleInput({ registration: 'AB12 CDE', type: 'van', capacityKg: MAX_VEHICLE_CAPACITY_KG + 1 })
    ).toMatchObject({ ok: false, field: 'capacityKg' });
    expect(validateVehicleInput({ registration: 'AB12 CDE', type: 'van', capacityKg: 2.5 })).toMatchObject({
      ok: false,
      field: 'capacityKg',
    });
  });
});
