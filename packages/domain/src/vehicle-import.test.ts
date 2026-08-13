import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from './csv.js';
import { buildVehicleImport, vehicleImportTemplateCsv } from './vehicle-import.js';

describe('parseCsv — what a real spreadsheet export looks like', () => {
  it('reads plain rows', () => {
    expect(parseCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps commas and newlines inside quoted fields', () => {
    expect(parseCsv('a,b\n"Smith, John","line1\nline2"')).toEqual([
      ['a', 'b'],
      ['Smith, John', 'line1\nline2'],
    ]);
  });

  it('treats a doubled quote as one literal quote', () => {
    expect(parseCsv('a\n"he said ""go"""')).toEqual([['a'], ['he said "go"']]);
  });

  it('handles CRLF and a trailing newline without inventing a row', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it("strips Excel's byte order mark, which would otherwise poison the first heading", () => {
    const [header] = parseCsv('﻿vehicleType,make\ntrailer,');
    expect(header).toEqual(['vehicleType', 'make']);
  });

  it('drops blank rows people leave at the bottom', () => {
    expect(parseCsv('a\n1\n\n\n')).toEqual([['a'], ['1']]);
  });

  it('round-trips through toCsv, quoting only what needs it', () => {
    const rows = [
      ['plain', 'has,comma'],
      ['has"quote', 'has\nnewline'],
    ];
    expect(toCsv(rows)).toContain('plain,"has,comma"');
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
});

describe('buildVehicleImport', () => {
  const header = ['vehicleType', 'vehicleConfiguration', 'registration', 'trailerNumber', 'make', 'model', 'year'];

  it('reads a sheet of mixed vehicle types', () => {
    const report = buildVehicleImport([
      header,
      ['rigid', 'box', 'AB12 CDE', '', 'Volvo', 'FL', '2021'],
      ['trailer', 'curtain sider', '', 'TR-114', '', '', ''],
      ['unit', '', 'CD34 EFG', '', 'Scania', 'R450', '2022'],
    ]);

    expect(report.fatal).toBeNull();
    expect(report.errorCount).toBe(0);
    expect(report.ready).toHaveLength(3);
    expect(report.ready[1]).toMatchObject({ vehicleType: 'trailer', trailerNumber: 'TR-114', registration: '' });
  });

  it('matches headings however they are cased, spaced or underscored', () => {
    const report = buildVehicleImport([
      ['Vehicle Type', 'vehicle_configuration', 'Reg', 'Fleet No'],
      ['TRAILER', 'Flatbed', '', 'TR-9'],
    ]);

    expect(report.errorCount).toBe(0);
    expect(report.ready[0]).toMatchObject({ vehicleType: 'trailer', vehicleConfiguration: 'flatbed', trailerNumber: 'TR-9' });
  });

  it('names the row and the reason for anything it will not import', () => {
    const report = buildVehicleImport([
      header,
      ['rigid', 'box', 'AB12 CDE', '', 'Volvo', 'FL', '2021'],
      ['spaceship', 'box', 'AB12 CDE', '', 'Volvo', 'FL', '2021'],
      ['trailer', 'curtain sider', '', '', '', '', ''],
      ['rigid', 'hovercraft', 'EF56 GHI', '', 'Volvo', 'FL', '2021'],
    ]);

    expect(report.ready).toHaveLength(1);
    expect(report.errorCount).toBe(3);
    // Row 1 is the header, so the first bad row is row 3 in the sheet.
    expect(report.rows[1]).toMatchObject({ rowNumber: 3 });
    expect(report.rows[1]?.error).toContain('spaceship');
    expect(report.rows[2]?.error).toContain('Trailer number');
    expect(report.rows[3]?.error).toContain('curtain sider'); // lists the allowed set
  });

  it('reports a heading it does not recognise rather than ignoring it', () => {
    const report = buildVehicleImport([
      ['vehicleType', 'trailerNumber', 'vehicleConfiguration', 'axles'],
      ['trailer', 'TR-1', 'box', '3'],
    ]);
    expect(report.unknownHeaders).toEqual(['axles']);
    expect(report.errorCount).toBe(0); // an extra column is not fatal
  });

  it('refuses a sheet with no vehicle type column, rather than importing nothing quietly', () => {
    const report = buildVehicleImport([
      ['make', 'model'],
      ['Volvo', 'FL'],
    ]);
    expect(report.fatal).toContain('vehicle type');
    expect(report.ready).toHaveLength(0);
  });

  it('refuses an empty file and a headings-only file, each in its own words', () => {
    expect(buildVehicleImport([]).fatal).toContain('no rows');
    expect(buildVehicleImport([header]).fatal).toContain('no vehicles');
  });

  it('takes a year a spreadsheet wrote as a number', () => {
    const report = buildVehicleImport([header, ['rigid', 'box', 'AB12 CDE', '', 'Volvo', 'FL', '2021.0']]);
    expect(report.ready[0]?.year).toBe(2021);
  });

  it('ships a template that imports cleanly as-is', () => {
    const report = buildVehicleImport(parseCsv(vehicleImportTemplateCsv()));
    expect(report.fatal).toBeNull();
    expect(report.errorCount).toBe(0);
    expect(report.ready).toHaveLength(3);
  });
});
