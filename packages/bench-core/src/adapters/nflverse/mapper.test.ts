import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { aggregateOLine, parsePbpCsv } from './mapper.js';
import { normalizeTeamCode } from './team-codes.js';

const sampleCsv = readFileSync(
  fileURLToPath(new URL('./__fixtures__/pbp-sample.csv', import.meta.url)),
  'utf8',
);

describe('parsePbpCsv', () => {
  it('parses rows and preserves quoted commas and escaped quotes', () => {
    const rows = parsePbpCsv(sampleCsv);
    expect(rows).toHaveLength(11);
    expect(rows[0]?.desc).toBe('Mahomes pass short right, complete');
    expect(rows[4]?.desc).toBe('Purdy scrambles, says "go"');
    // empty cells surface as '' (qb_dropback omitted on the LA rows)
    expect(rows[6]?.qb_dropback).toBe('');
  });
});

describe('aggregateOLine', () => {
  it('aggregates per team, sorted by normalized code', () => {
    const result = aggregateOLine(parsePbpCsv(sampleCsv));
    expect(result).toEqual([
      // 2 qb_dropback=1 rows; 1 sack; 2 rush_attempts, only one with charted epa
      { team: 'KC', dropbacks: 2, sacks: 1, rushAttempts: 2, rushEpaSum: 0.3 },
      // LA -> LAR; dropbacks derived from pass_attempt + sack + scramble
      { team: 'LAR', dropbacks: 3, sacks: 1, rushAttempts: 1, rushEpaSum: 0.1 },
      // scramble counts as a dropback but not a rush attempt
      { team: 'SF', dropbacks: 1, sacks: 0, rushAttempts: 1, rushEpaSum: -0.5 },
    ]);
  });

  it('skips rows with no possessing team', () => {
    const teams = aggregateOLine(parsePbpCsv(sampleCsv)).map((a) => a.team);
    expect(teams).not.toContain('');
  });
});

describe('normalizeTeamCode', () => {
  it('canonicalizes relocation/variant abbreviations', () => {
    expect(normalizeTeamCode('LA')).toBe('LAR');
    expect(normalizeTeamCode('STL')).toBe('LAR');
    expect(normalizeTeamCode('WSH')).toBe('WAS');
    expect(normalizeTeamCode('JAC')).toBe('JAX');
    expect(normalizeTeamCode('OAK')).toBe('LV');
    expect(normalizeTeamCode('SD')).toBe('LAC');
  });

  it('passes unknown codes through uppercased and trimmed', () => {
    expect(normalizeTeamCode(' kc ')).toBe('KC');
    expect(normalizeTeamCode('BUF')).toBe('BUF');
  });
});
