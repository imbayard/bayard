import type { TeamOLineAggregate } from '../../types/nflverse.js';
import { normalizeTeamCode } from './team-codes.js';
import type { RawPbpRow } from './types.js';

/**
 * Splits raw CSV text into rows of string fields. Handles RFC-4180 quoting:
 * fields wrapped in double quotes may contain commas, newlines, and escaped
 * quotes (`""`). nflverse play descriptions frequently embed quoted commas.
 */
function parseCsvRows(text: string): string[][] {
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

/** Parses nflverse play-by-play CSV text into header-keyed row objects. */
export function parsePbpCsv(text: string): RawPbpRow[] {
  const rows = parseCsvRows(text);
  const header = rows[0];
  if (!header) return [];

  const out: RawPbpRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const values = rows[r]!;
    const obj: RawPbpRow = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]!] = values[c];
    }
    out.push(obj);
  }
  return out;
}

/** A parsed EPA value, or undefined when the cell is empty/NA/non-numeric. */
function parseEpa(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === 'NA' || trimmed === 'NaN') return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * A dropback is any pass attempt, sack, or scramble. Prefer nflverse's own
 * `qb_dropback` flag when the column is populated; older seasons omit it, so
 * fall back to deriving it from pass attempt + sack + scramble.
 */
function isDropback(row: RawPbpRow): boolean {
  if (row.qb_dropback !== undefined && row.qb_dropback !== '') {
    return row.qb_dropback === '1';
  }
  return row.pass_attempt === '1' || row.sack === '1' || row.qb_scramble === '1';
}

/**
 * Aggregates play-by-play rows into per-team offensive-line blocking counts.
 * Pure — no I/O — so it is unit-testable without touching the network.
 * Output is sorted by normalized team code for deterministic results.
 */
export function aggregateOLine(rows: RawPbpRow[]): TeamOLineAggregate[] {
  const byTeam = new Map<string, TeamOLineAggregate>();

  const bucket = (team: string): TeamOLineAggregate => {
    let agg = byTeam.get(team);
    if (!agg) {
      agg = { team, dropbacks: 0, sacks: 0, rushAttempts: 0, rushEpaSum: 0 };
      byTeam.set(team, agg);
    }
    return agg;
  };

  for (const row of rows) {
    const rawTeam = row.posteam;
    if (!rawTeam || rawTeam === 'NA') continue;
    const agg = bucket(normalizeTeamCode(rawTeam));

    if (isDropback(row)) agg.dropbacks++;
    if (row.sack === '1') agg.sacks++;
    if (row.rush_attempt === '1') {
      agg.rushAttempts++;
      const epa = parseEpa(row.epa);
      if (epa !== undefined) agg.rushEpaSum += epa;
    }
  }

  return [...byTeam.values()].sort((a, b) => a.team.localeCompare(b.team));
}
