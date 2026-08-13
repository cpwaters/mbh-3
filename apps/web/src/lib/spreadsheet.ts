import { parseCsv } from '@mbh/domain';

// Reads a fleet spreadsheet into a plain grid of strings, which the domain
// then makes sense of. Browser-only by design: the file never leaves the
// device, so importing forty trailers costs no upload and works on a bad
// signal.
//
// .xlsx is a ZIP of XML. Rather than SheetJS — whose npm build is stuck at
// 0.18.5 with unpatched prototype-pollution and ReDoS advisories, its fixes
// living only on a vendor CDN — this unzips with fflate (~30KB, no deps) and
// reads the sheet with the browser's own DOMParser. fflate is imported
// dynamically so the cost lands only on someone who actually opens an .xlsx,
// not on every driver loading the app over a patchy connection.

export interface SheetReadError {
  message: string;
}

export function isSpreadsheetName(name: string): boolean {
  return /\.(csv|xlsx)$/i.test(name.trim());
}

export async function readSpreadsheet(file: File): Promise<string[][]> {
  if (/\.csv$/i.test(file.name)) {
    return parseCsv(await file.text());
  }
  if (/\.xlsx$/i.test(file.name)) {
    return readXlsx(new Uint8Array(await file.arrayBuffer()));
  }
  throw new Error('That file type is not supported — use a .csv or .xlsx file.');
}

// A1 -> 0, B1 -> 1, AA1 -> 26. Cells carry their reference, and a row omits
// empty cells entirely, so without this a blank column silently shifts every
// value after it into the wrong field.
function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref.toUpperCase())?.[0] ?? '';
  let index = 0;
  for (const letter of letters) {
    index = index * 26 + (letter.charCodeAt(0) - 64);
  }
  return index - 1;
}

function textOf(node: Element | null): string {
  return node === null ? '' : (node.textContent ?? '');
}

async function readXlsx(bytes: Uint8Array): Promise<string[][]> {
  const { unzipSync, strFromU8 } = await import('fflate');

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new Error('That .xlsx file could not be opened — try re-saving it, or export it as CSV.');
  }

  // Sheets are usually xl/worksheets/sheet1.xml, but the name is not
  // guaranteed, so take the first worksheet the archive holds.
  const sheetName = Object.keys(files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort()[0];
  if (sheetName === undefined) {
    throw new Error('That .xlsx file has no worksheets in it.');
  }

  const parser = new DOMParser();

  // Most text lives in a shared-strings table; a cell of type "s" holds an
  // index into it rather than the words themselves.
  const sharedBytes = files['xl/sharedStrings.xml'];
  const shared: string[] = [];
  if (sharedBytes !== undefined) {
    const doc = parser.parseFromString(strFromU8(sharedBytes), 'application/xml');
    for (const si of Array.from(doc.getElementsByTagName('si'))) {
      // Rich text splits one string across several <t> runs.
      shared.push(
        Array.from(si.getElementsByTagName('t'))
          .map((t) => t.textContent ?? '')
          .join('')
      );
    }
  }

  const doc = parser.parseFromString(strFromU8(files[sheetName]!), 'application/xml');
  const grid: string[][] = [];

  for (const row of Array.from(doc.getElementsByTagName('row'))) {
    const cells: string[] = [];
    for (const cell of Array.from(row.getElementsByTagName('c'))) {
      const type = cell.getAttribute('t');
      let value: string;
      if (type === 's') {
        const at = Number(textOf(cell.getElementsByTagName('v')[0] ?? null));
        value = shared[at] ?? '';
      } else if (type === 'inlineStr') {
        value = Array.from(cell.getElementsByTagName('t'))
          .map((t) => t.textContent ?? '')
          .join('');
      } else {
        value = textOf(cell.getElementsByTagName('v')[0] ?? null);
      }

      const ref = cell.getAttribute('r');
      const at = ref === null ? cells.length : columnIndex(ref);
      while (cells.length < at) cells.push('');
      cells[at] = value;
    }
    if (cells.some((c) => c.trim() !== '')) grid.push(cells);
  }

  return grid;
}
