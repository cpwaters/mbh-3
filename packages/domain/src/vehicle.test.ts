import { describe, expect, it } from 'vitest';
import {
  isValidVehicleConfiguration,
  normalizeRegistration,
  normalizeTrailerNumber,
  validateVehicleInput,
  vehicleNeedsConfiguration,
  vehicleNeedsRegistrationDetails,
  vehicleNeedsTrailerNumber,
} from './vehicle.js';

const base = {
  registration: 'AB12 CDE',
  make: 'Volvo',
  model: 'FH16',
  year: 2020,
  trailerNumber: '',
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
    // A rigid, not the `base` unit: a unit legitimately has no configuration
    // of its own now, so its configuration is not validated at all.
    expect(validateVehicleInput({ ...base, vehicleType: 'rigid', vehicleConfiguration: 'jet' })).toMatchObject({
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

describe('what each vehicle type needs', () => {
  const complete = {
    registration: 'AB12 CDE',
    make: 'Volvo',
    model: 'FH16',
    year: 2021,
    trailerNumber: '',
    vehicleType: 'rigid',
    vehicleConfiguration: 'box',
  };

  it('a trailer needs no registration, make, model or year — just a configuration', () => {
    expect(
      validateVehicleInput({
        ...complete,
        vehicleType: 'trailer',
        registration: '',
        make: '',
        model: '',
        year: 0,
        trailerNumber: 'TR-114',
        vehicleConfiguration: 'curtain sider',
      })
    ).toEqual({ ok: true });
  });

  it('a trailer still needs a configuration — that is the whole point of one', () => {
    expect(
      validateVehicleInput({
        ...complete,
        vehicleType: 'trailer',
        registration: '',
        make: '',
        model: '',
        year: 0,
        trailerNumber: 'TR-114',
        vehicleConfiguration: '',
      })
    ).toMatchObject({ ok: false, field: 'vehicleConfiguration' });
  });

  it('a unit needs no configuration — the trailer it pulls carries that', () => {
    expect(validateVehicleInput({ ...complete, vehicleType: 'unit', vehicleConfiguration: '' })).toEqual({ ok: true });
  });

  it('a unit still needs its plate, make, model and year', () => {
    expect(
      validateVehicleInput({ ...complete, vehicleType: 'unit', vehicleConfiguration: '', registration: '' })
    ).toMatchObject({ ok: false, field: 'registration' });
    expect(
      validateVehicleInput({ ...complete, vehicleType: 'unit', vehicleConfiguration: '', make: '' })
    ).toMatchObject({ ok: false, field: 'make' });
  });

  it('vans and rigids need both halves', () => {
    for (const vehicleType of ['van', 'rigid']) {
      expect(validateVehicleInput({ ...complete, vehicleType, registration: '' })).toMatchObject({ ok: false, field: 'registration' });
      expect(validateVehicleInput({ ...complete, vehicleType, vehicleConfiguration: '' })).toMatchObject({
        ok: false,
        field: 'vehicleConfiguration',
      });
    }
  });

  it('reports an unknown type before complaining about fields that type may not need', () => {
    expect(
      validateVehicleInput({ ...complete, vehicleType: 'hovercraft', registration: '', make: '' })
    ).toMatchObject({ ok: false, field: 'vehicleType' });
  });

  it('exposes the rule so the form and the server cannot drift apart', () => {
    expect(vehicleNeedsRegistrationDetails('trailer')).toBe(false);
    expect(vehicleNeedsRegistrationDetails('unit')).toBe(true);
    expect(vehicleNeedsConfiguration('unit')).toBe(false);
    expect(vehicleNeedsConfiguration('trailer')).toBe(true);
    expect(vehicleNeedsTrailerNumber('trailer')).toBe(true);
    expect(vehicleNeedsTrailerNumber('rigid')).toBe(false);
  });
});

describe('a trailer number', () => {
  const trailer = {
    registration: '',
    make: '',
    model: '',
    year: 0,
    trailerNumber: 'TR-114',
    vehicleType: 'trailer',
    vehicleConfiguration: 'curtain sider',
  };

  it('is what identifies a trailer, so it is required', () => {
    expect(validateVehicleInput(trailer)).toEqual({ ok: true });
    expect(validateVehicleInput({ ...trailer, trailerNumber: '   ' })).toMatchObject({
      ok: false,
      field: 'trailerNumber',
    });
  });

  it('is not asked of anything that carries a plate', () => {
    const rigid = { ...trailer, vehicleType: 'rigid', registration: 'AB12 CDE', make: 'Volvo', model: 'FL', year: 2021 };
    expect(validateVehicleInput({ ...rigid, trailerNumber: '' })).toEqual({ ok: true });
  });

  it('normalizes the way a plate does — a yard writes it every which way', () => {
    expect(normalizeTrailerNumber('  tr-114 ')).toBe('TR-114');
    expect(normalizeTrailerNumber('tr  114')).toBe('TR 114');
  });
});
