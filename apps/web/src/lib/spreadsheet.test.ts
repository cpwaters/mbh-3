import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { isSpreadsheetName, readSpreadsheet } from './spreadsheet';

// Builds a real .xlsx: a ZIP whose sheet XML references a shared-strings
// table, which is how Excel actually writes text. Hand-rolling the reader
// (rather than shipping SheetJS's advisory-carrying npm build) means this has
// to be proved against a genuine archive, not a mock.
function xlsx(sheetXml: string, sharedStrings: string[] = []): File {
  const files: Record<string, Uint8Array> = {
    'xl/worksheets/sheet1.xml': strToU8(
      `<?xml version="1.0"?><worksheet><sheetData>${sheetXml}</sheetData></worksheet>`
    ),
  };
  if (sharedStrings.length > 0) {
    files['xl/sharedStrings.xml'] = strToU8(
      `<?xml version="1.0"?><sst>${sharedStrings.map((s) => `<si><t>${s}</t></si>`).join('')}</sst>`
    );
  }
  return new File([zipSync(files)], 'fleet.xlsx');
}

// A cell holding shared string #n.
const s = (ref: string, n: number) => `<c r="${ref}" t="s"><v>${n}</v></c>`;
// A cell holding a raw number.
const n = (ref: string, value: string) => `<c r="${ref}"><v>${value}</v></c>`;

describe('readSpreadsheet', () => {
  it('reads a CSV', async () => {
    const file = new File(['vehicleType,make\ntrailer,Volvo'], 'fleet.csv', { type: 'text/csv' });
    await expect(readSpreadsheet(file)).resolves.toEqual([
      ['vehicleType', 'make'],
      ['trailer', 'Volvo'],
    ]);
  });

  it('reads an .xlsx through its shared-strings table', async () => {
    const file = xlsx(
      `<row>${s('A1', 0)}${s('B1', 1)}</row><row>${s('A2', 2)}${n('B2', '2021')}</row>`,
      ['vehicleType', 'year', 'trailer']
    );
    await expect(readSpreadsheet(file)).resolves.toEqual([
      ['vehicleType', 'year'],
      ['trailer', '2021'],
    ]);
  });

  it('keeps a blank column in place instead of shifting the values after it', async () => {
    // B2 is absent entirely — which is how a spreadsheet stores an empty cell.
    // Read naively, "curtain sider" would slide into the make column.
    const file = xlsx(
      `<row>${s('A1', 0)}${s('B1', 1)}${s('C1', 2)}</row><row>${s('A2', 3)}${s('C2', 4)}</row>`,
      ['vehicleType', 'make', 'vehicleConfiguration', 'trailer', 'curtain sider']
    );
    await expect(readSpreadsheet(file)).resolves.toEqual([
      ['vehicleType', 'make', 'vehicleConfiguration'],
      ['trailer', '', 'curtain sider'],
    ]);
  });

  it('reads inline strings, which some exporters write instead', async () => {
    const file = xlsx(`<row><c r="A1" t="inlineStr"><is><t>vehicleType</t></is></c></row>`);
    await expect(readSpreadsheet(file)).resolves.toEqual([['vehicleType']]);
  });

  it('skips rows that are entirely empty', async () => {
    const file = xlsx(`<row>${s('A1', 0)}</row><row></row><row>${s('A3', 1)}</row>`, ['vehicleType', 'trailer']);
    await expect(readSpreadsheet(file)).resolves.toEqual([['vehicleType'], ['trailer']]);
  });

  it('explains an unreadable .xlsx instead of throwing something cryptic', async () => {
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'broken.xlsx');
    await expect(readSpreadsheet(file)).rejects.toThrow(/could not be opened/);
  });

  it('explains an .xlsx with no worksheet in it', async () => {
    const file = new File([zipSync({ 'docProps/app.xml': strToU8('<x/>') })], 'empty.xlsx');
    await expect(readSpreadsheet(file)).rejects.toThrow(/no worksheets/);
  });

  it('refuses a file type it cannot read', async () => {
    await expect(readSpreadsheet(new File(['x'], 'fleet.pdf'))).rejects.toThrow(/not supported/);
  });

  it('recognises the names it accepts', () => {
    expect(isSpreadsheetName('fleet.csv')).toBe(true);
    expect(isSpreadsheetName('Fleet.XLSX')).toBe(true);
    expect(isSpreadsheetName('fleet.numbers')).toBe(false);
  });
});
