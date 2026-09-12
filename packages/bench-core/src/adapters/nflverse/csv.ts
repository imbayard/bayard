/**
 * CSV parsing shared by the nflverse release readers (play-by-play, team weekly stats).
 * nflverse ships plain RFC-4180 CSV inside its `.csv.gz` assets, so one parser covers
 * every asset — only the row type differs.
 */

/**
 * Splits raw CSV text into rows of string fields. Handles RFC-4180 quoting:
 * fields wrapped in double quotes may contain commas, newlines, and escaped
 * quotes (`""`). nflverse play descriptions frequently embed quoted commas.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++; // consume the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  // Flush the final field/row when the text doesn't end in a newline.
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Parses CSV text into header-keyed row objects. Every value stays a string —
 * nflverse writes missing cells as `''` or `'NA'`, so callers coerce with
 * {@link parseNumeric} rather than trusting a blanket `Number()`.
 */
export function parseCsvRecords<T>(text: string): T[] {
  const rows = parseCsvRows(text);
  const header = rows[0];
  if (!header) return [];

  const out: T[] = [];
  for (let r = 1; r < rows.length; r++) {
    const values = rows[r] as string[];
    const obj: Record<string, string | undefined> = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c] as string] = values[c];
    }
    out.push(obj as T);
  }
  return out;
}

/** A parsed numeric cell, or undefined when it is empty/NA/non-numeric. */
export function parseNumeric(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'NA' || trimmed === 'NaN') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/** Numeric cell with a 0 default — for counting columns where absent means "none". */
export function numberOr0(raw: string | undefined): number {
  return parseNumeric(raw) ?? 0;
}
