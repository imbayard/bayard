import { describe, expect, it } from 'vitest';
import { computeRosterNeeds } from './roster-needs.js';

const STANDARD = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN'];
const SUPERFLEX = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'BN'];

/** Compact view of the result: 'SLOT filled/required'. */
function summarize(rosterSlots: string[], positions: string[]): string[] {
  return computeRosterNeeds(rosterSlots, positions).needs.map(
    (n) => `${n.slot} ${n.filled}/${n.required}`,
  );
}

describe('computeRosterNeeds', () => {
  it('reports the whole starting lineup as unfilled before any picks', () => {
    expect(summarize(STANDARD, [])).toEqual([
      'QB 0/1',
      'RB 0/2',
      'WR 0/2',
      'TE 0/1',
      'FLEX 0/1',
      'K 0/1',
      'DEF 0/1',
    ]);
  });

  it('ignores bench slots', () => {
    const needs = computeRosterNeeds(STANDARD, []).needs;
    expect(needs.some((n) => n.slot === 'BN')).toBe(false);
    expect(computeRosterNeeds(STANDARD, []).remaining).toBe(9);
  });

  it('fills dedicated slots before flex', () => {
    expect(summarize(STANDARD, ['RB', 'RB', 'WR'])).toEqual([
      'QB 0/1',
      'RB 2/2',
      'WR 1/2',
      'TE 0/1',
      'FLEX 0/1',
      'K 0/1',
      'DEF 0/1',
    ]);
  });

  it('spills the surplus into flex and counts the rest as depth', () => {
    const result = computeRosterNeeds(STANDARD, ['RB', 'RB', 'RB', 'RB', 'RB']);
    expect(result.needs.find((n) => n.slot === 'FLEX')?.filled).toBe(1);
    expect(result.surplusByPosition).toEqual({ RB: 2 });
    expect(result.remaining).toBe(6);
  });

  it('puts a second QB in superflex, not in surplus', () => {
    const result = computeRosterNeeds(SUPERFLEX, ['QB', 'QB']);
    expect(result.needs.find((n) => n.slot === 'SUPER_FLEX')?.filled).toBe(1);
    expect(result.surplusByPosition).toEqual({});
  });

  it('fills the most restrictive flex first so no player is stranded', () => {
    // One TE, one RB: TE can only fill FLEX, so the RB has to take WRRB_FLEX.
    const slots = ['WRRB_FLEX', 'FLEX'];
    const result = computeRosterNeeds(slots, ['TE', 'RB']);
    expect(result.remaining).toBe(0);
    expect(result.surplusByPosition).toEqual({});
  });

  it('understands ESPN composite slot labels', () => {
    expect(summarize(['QB/RB/WR/TE'], ['QB'])).toEqual(['QB/RB/WR/TE 1/1']);
    expect(summarize(['RB/WR'], ['TE'])).toEqual(['RB/WR 0/1']);
  });

  it('matches exotic slots by exact position', () => {
    expect(summarize(['DL', 'LB'], ['LB', 'LB'])).toEqual(['DL 0/1', 'LB 1/1']);
  });

  it('normalizes position casing and ignores blanks', () => {
    expect(summarize(['QB'], ['qb'])).toEqual(['QB 1/1']);
    expect(computeRosterNeeds(['QB'], ['', '  ']).remaining).toBe(1);
  });
});
