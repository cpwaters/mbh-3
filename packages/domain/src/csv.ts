// A CSV reader that survives what a real spreadsheet export looks like:
// quoted fields containing commas and newlines, doubled quotes as an escape,
// CRLF line endings, and the BOM Excel writes on "CSV UTF-8". Zero deps — the
// domain owns this so the parse rules are testable without a browser.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  // Excel's "CSV UTF-8" leads with a byte order mark; left in, it becomes part
  // of the first header and every column lookup misses.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const endField = (): void => {
    row.push(field);
    field = '';
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const char = input[i]!;

    if (quoted) {
      if (char === '"') {
        // A doubled quote inside a quoted field is one literal quote.
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"' && field === '') {
      quoted = true;
      i += 1;
      continue;
    }
    if (char === ',') {
      endField();
      i += 1;
      continue;
    }
    if (char === '\r') {
      // CRLF or a lone CR — either way, one row ends.
      endRow();
      i += input[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (char === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += char;
    i += 1;
  }

  // A trailing newline should not invent a final empty row.
  if (field !== '' || row.length > 0) endRow();

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// Quote only what needs it, so a template opens cleanly in every spreadsheet.
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell))
        .join(',')
    )
    .join('\r\n');
}
