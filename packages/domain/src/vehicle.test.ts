import { describe, expect, it } from 'vitest';
import { isValidVehicleConfiguration, normalizeRegistration, validateVehicleInput } from './vehicle.js';

const base = {
  registration: 'AB12 CDE',
  make: 'Volvo',
  model: 'FH16',
  year: 2020,
  vehicleType: 'unit',
  vehicleConfiguration: 'curtain sider',
};

describe('vehicle', () => {
  it('normalizes a registration: trim, uppercase, collapse whitespace', () => {
    expect(normalizeRegistration('  ab12   cde ')).toBe('AB12 CDE');
    expect(normalizeRegistration('ab12cde')).toBe('AB12CDE');
  });

  it('accepts a valid vehicle', () => {
    expect(validateVehicleInput(base)).toEqual({ ok: true });
  });

  it('rejects bad fields with the offending field', () => {
    expect(validateVehicleInput({ ...base, registration: 'A' })).toMatchObject({ ok: false, field: 'registration' });
    expect(validateVehicleInput({ ...base, make: '' })).toMatchObject({ ok: false, field: 'make' });
    expect(validateVehicleInput({ ...base, model: '' })).toMatchObject({ ok: false, field: 'model' });
    expect(validateVehicleInput({ ...base, year: 1800 })).toMatchObject({ ok: false, field: 'year' });
    expect(validateVehicleInput({ ...base, vehicleType: 'spaceship' })).toMatchObject({ ok: false, field: 'vehicleType' });
    expect(validateVehicleInput({ ...base, vehicleConfiguration: 'jet' })).toMatchObject({
      ok: false,
      field: 'vehicleConfiguration',
    });
  });

  it('validates the configuration enum', () => {
    expect(isValidVehicleConfiguration('flatbed')).toBe(true);
    expect(isValidVehicleConfiguration('refrigerated')).toBe(true);
    expect(isValidVehicleConfiguration('nope')).toBe(false);
  });
});
