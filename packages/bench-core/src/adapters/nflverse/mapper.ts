import type { TeamOLineAggregate } from '../../types/nflverse.js';
import { parseCsvRecords, parseNumeric } from './csv.js';
import { normalizeTeamCode } from './team-codes.js';
import type { RawPbpRow } from './types.js';

/** Parses nflverse play-by-play CSV text into header-keyed row objects. */
export function parsePbpCsv(text: string): RawPbpRow[] {
  return parseCsvRecords<RawPbpRow>(text);
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
      const epa = parseNumeric(row.epa);
      if (epa !== undefined) agg.rushEpaSum += epa;
    }
  }

  return [...byTeam.values()].sort((a, b) => a.team.localeCompare(b.team));
}
