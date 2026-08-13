import { toCsv } from './csv.js';
import {
  VEHICLE_CONFIGURATIONS,
  VEHICLE_TYPES,
  validateVehicleInput,
  vehicleNeedsConfiguration,
  vehicleNeedsRegistrationDetails,
  vehicleNeedsTrailerNumber,
  type VehicleInput,
} from './vehicle.js';

// Turning a fleet spreadsheet into vehicles. A haulier with forty trailers
// should type them once, not forty times — but a bad row must be named and
// skipped rather than quietly dropped or half-imported, so this reports on
// every row and leaves the decision to the caller.

// What each column is called in the sheet. Matched loosely (case, spaces and
// underscores ignored) because nobody types a header exactly.
const COLUMNS: Readonly<Record<keyof VehicleInput | 'vin', readonly string[]>> = {
  vehicleType: ['vehicletype', 'type'],
  vehicleConfiguration: ['vehicleconfiguration', 'configuration', 'config', 'bodytype'],
  registration: ['registration', 'registrationnumber', 'reg', 'plate', 'vrm'],
  trailerNumber: ['trailernumber', 'trailerno', 'fleetnumber', 'fleetno'],
  make: ['make'],
  model: ['model'],
  year: ['year'],
  vin: ['vin'],
};

export interface VehicleImportRow {
  /** 1-based row number as the spreadsheet shows it, header included. */
  rowNumber: number;
  vehicle: (VehicleInput & { vin: string }) | null;
  error: string | null;
}

export interface VehicleImportReport {
  rows: VehicleImportRow[];
  ready: (VehicleInput & { vin: string })[];
  errorCount: number;
  /** Column headings the sheet had that nothing recognises — surfaced so a
      mis-typed heading looks like a mistake rather than a silent omission. */
  unknownHeaders: string[];
  /** Set when the sheet is unusable as a whole, e.g. no recognisable type
      column. Individual bad rows use `error` instead. */
  fatal: string | null;
}

const normalizeHeader = (raw: string): string => raw.toLowerCase().replace(/[\s_\-]/g, '');

function mapHeaders(header: readonly string[]): {
  index: Partial<Record<keyof typeof COLUMNS, number>>;
  unknown: string[];
} {
  const index: Partial<Record<keyof typeof COLUMNS, number>> = {};
  const unknown: string[] = [];

  header.forEach((raw, column) => {
    const name = normalizeHeader(raw);
    if (name === '') return;
    const match = (Object.keys(COLUMNS) as (keyof typeof COLUMNS)[]).find((field) =>
      COLUMNS[field].includes(name)
    );
    // First one wins, so a duplicated column cannot silently override the
    // values already read from its twin.
    if (match === undefined) unknown.push(raw.trim());
    else if (index[match] === undefined) index[match] = column;
  });

  return { index, unknown };
}

// A year may arrive as "2021", "2021.0" (a spreadsheet number), or blank.
function parseYear(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  const value = Number(trimmed);
  return Number.isFinite(value) ? Math.trunc(value) : NaN;
}

export function buildVehicleImport(grid: readonly (readonly string[])[]): VehicleImportReport {
  const empty: VehicleImportReport = { rows: [], ready: [], errorCount: 0, unknownHeaders: [], fatal: null };
  if (grid.length === 0) {
    return { ...empty, fatal: 'That file has no rows in it.' };
  }

  const { index, unknown } = mapHeaders(grid[0]!);
  if (index.vehicleType === undefined) {
    return {
      ...empty,
      unknownHeaders: unknown,
      fatal: 'No "vehicle type" column found — the first row must be the column headings.',
    };
  }

  const cell = (row: readonly string[], field: keyof typeof COLUMNS): string => {
    const column = index[field];
    return column === undefined ? '' : (row[column] ?? '').trim();
  };

  const rows: VehicleImportRow[] = [];
  const ready: (VehicleInput & { vin: string })[] = [];

  for (let i = 1; i < grid.length; i += 1) {
    const raw = grid[i]!;
    const rowNumber = i + 1; // 1-based, and row 1 is the header
    const vehicleType = cell(raw, 'vehicleType').toLowerCase();
    const year = parseYear(cell(raw, 'year'));

    const vehicle = {
      vehicleType,
      vehicleConfiguration: cell(raw, 'vehicleConfiguration').toLowerCase(),
      registration: cell(raw, 'registration'),
      trailerNumber: cell(raw, 'trailerNumber'),
      make: cell(raw, 'make'),
      model: cell(raw, 'model'),
      year: Number.isNaN(year) ? 0 : year,
      vin: cell(raw, 'vin'),
    };

    // The domain already owns what a valid vehicle is — this only has to
    // explain the failure in terms of the sheet the person is looking at.
    const check = validateVehicleInput(vehicle);
    if (check.ok) {
      rows.push({ rowNumber, vehicle, error: null });
      ready.push(vehicle);
    } else {
      rows.push({ rowNumber, vehicle: null, error: explain(check.field, check.message, vehicleType) });
    }
  }

  return {
    rows,
    ready,
    errorCount: rows.filter((row) => row.error !== null).length,
    unknownHeaders: unknown,
    fatal: rows.length === 0 ? 'That file has headings but no vehicles under them.' : null,
  };
}

// The domain's message is written for the form, where the offending field is
// on screen. In a sheet it has to name the column, and say what the allowed
// values are for the two that are closed sets.
function explain(field: string, message: string, vehicleType: string): string {
  if (field === 'vehicleType') {
    return `Vehicle type "${vehicleType}" is not one of: ${VEHICLE_TYPES.join(', ')}.`;
  }
  if (field === 'vehicleConfiguration') {
    return `Configuration must be one of: ${VEHICLE_CONFIGURATIONS.join(', ')}.`;
  }
  if (field === 'trailerNumber') return 'Trailer number is missing — a trailer is known by its number.';
  if (field === 'registration') return 'Registration is missing or too short.';
  if (field === 'year') return 'Year is missing or not a real year.';
  return message;
}

// A starter file, so the first thing someone does is not guess the headings.
// The example rows show the two shapes that trip people up: a trailer carries
// a number and no plate, a unit carries a plate and no configuration.
export function vehicleImportTemplateCsv(): string {
  return toCsv([
    ['vehicleType', 'vehicleConfiguration', 'registration', 'trailerNumber', 'make', 'model', 'year', 'vin'],
    ['rigid', 'box', 'AB12 CDE', '', 'Volvo', 'FL', '2021', ''],
    ['unit', '', 'CD34 EFG', '', 'Scania', 'R450', '2022', ''],
    ['trailer', 'curtain sider', '', 'TR-114', '', '', '', ''],
  ]);
}

// What a given type is asked for, so the import screen can explain the rules
// without restating them (and drifting from) the domain.
export function vehicleImportColumnsFor(vehicleType: string): string[] {
  const columns = ['vehicleType'];
  if (vehicleNeedsConfiguration(vehicleType)) columns.push('vehicleConfiguration');
  if (vehicleNeedsTrailerNumber(vehicleType)) columns.push('trailerNumber');
  if (vehicleNeedsRegistrationDetails(vehicleType)) columns.push('registration', 'make', 'model', 'year');
  return columns;
}
