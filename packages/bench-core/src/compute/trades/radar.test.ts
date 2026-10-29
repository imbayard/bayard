import { describe, expect, it } from 'vitest';
import type { MarketValue } from '../../adapters/fantasycalc/client.js';
import type { League, Player, Roster, Team } from '../../types/league.js';
import type { SeasonProduction } from '../../types/platform.js';
import { optimalLineup } from './lineup.js';
import { tradeRadar, type TradeRadarInput } from './radar.js';
import { ageMultiplier, marketFormat, shrinkPpg } from './values.js';

const SLOTS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN'];

const league: League = {
  platform: 'sleeper',
  externalLeagueId: 'L',
  name: 'Test',
  season: 2026,
  scoringFormat: { rec: 1 },
  leagueType: 'redraft',
  rosterSlots: SLOTS,
  teamCount: 4,
  currentWeek: 8,
  draftDate: null,
  draftStatus: 'complete',
};

/** [id, position, season ppg, market value, age] */
type Row = [string, string, number, number, number];

/** Me: deep at WR, a hole at RB. Partner "rb": deep at RB, a hole at WR. */
const ROSTERS: Record<string, Row[]> = {
  me: [
    ['me-qb', 'QB', 20, 5000, 27], ['me-rb1', 'RB', 14, 4500, 25], ['me-rb2', 'RB', 6, 800, 28],
    ['me-wr1', 'WR', 19, 7000, 25], ['me-wr2', 'WR', 17, 6000, 26], ['me-wr3', 'WR', 15, 5200, 27],
    ['me-wr4', 'WR', 14, 4800, 24], ['me-te', 'TE', 10, 3000, 28],
  ],
  rb: [
    ['rb-qb', 'QB', 19, 4800, 29], ['rb-rb1', 'RB', 20, 8000, 24], ['rb-rb2', 'RB', 17, 6500, 25],
    ['rb-rb3', 'RB', 15, 5500, 26], ['rb-wr1', 'WR', 12, 3500, 29], ['rb-wr2', 'WR', 7, 900, 30],
    ['rb-te', 'TE', 9, 2800, 27],
  ],
  mid: [
    ['mid-qb', 'QB', 18, 4500, 30], ['mid-rb1', 'RB', 13, 4000, 26], ['mid-rb2', 'RB', 11, 3000, 27],
    ['mid-wr1', 'WR', 15, 5000, 26], ['mid-wr2', 'WR', 13, 4000, 27], ['mid-te', 'TE', 11, 3500, 26],
  ],
  low: [
    ['low-qb', 'QB', 15, 3000, 33], ['low-rb1', 'RB', 10, 2500, 29], ['low-rb2', 'RB', 9, 2000, 30],
    ['low-wr1', 'WR', 11, 3000, 30], ['low-wr2', 'WR', 10, 2500, 31], ['low-te', 'TE', 7, 1500, 31],
  ],
};
/** On nobody's roster: sets replacement level. */
const WAIVERS: Row[] = [['fa-qb', 'QB', 12, 500, 30], ['fa-rb', 'RB', 5, 300, 27], ['fa-wr', 'WR', 6, 300, 26], ['fa-te', 'TE', 4, 200, 29]];

function build(records: Record<string, [number, number]> = {}): TradeRadarInput {
  const players = new Map<string, Player>();
  const production = new Map<string, SeasonProduction>();
  const market = new Map<string, MarketValue>();
  for (const [id, position, ppg, value, age] of [...Object.values(ROSTERS).flat(), ...WAIVERS]) {
    players.set(id, { externalPlayerId: id, fullName: id, position, nflTeam: 'KC', injuryStatus: null, byeWeek: 7, projectedPoints: null });
    production.set(id, { ppg, games: 7, priorPpg: ppg, priorGames: 16 });
    market.set(id, { value, age, trend30Day: 0 });
  }
  const teams: Team[] = Object.keys(ROSTERS).map((id) => {
    const [wins, losses] = records[id] ?? [4, 3];
    return { externalTeamId: id, ownerExternalUserId: id, displayName: id, wins, losses, ties: 0, pointsFor: 0, pointsAgainst: 0 };
  });
  const rosters: Roster[] = Object.entries(ROSTERS).map(([id, rows]) => ({
    externalTeamId: id,
    entries: rows.map(([pid]) => ({ externalPlayerId: pid, slot: 'bench' as const })),
  }));
  return {
    league, teams, rosters, players, myTeamId: 'me', production,
    calibration: { yoyR: 0.78, shrinkK: 1.14 }, market, useMarket: true,
  };
}

describe('optimalLineup', () => {
  it('fills dedicated slots first, then flex from what is left', () => {
    const lineup = optimalLineup(['QB', 'RB', 'WR', 'FLEX', 'K', 'BN'], [
      { id: 'q', position: 'QB', ppg: 20 },
      { id: 'r1', position: 'RB', ppg: 15 },
      { id: 'r2', position: 'RB', ppg: 12 },
      { id: 'w1', position: 'WR', ppg: 10 },
      { id: 'w2', position: 'WR', ppg: 9 },
    ]);
    expect([...lineup.starters].sort()).toEqual(['q', 'r1', 'r2', 'w1']);
    expect(lineup.points).toBe(57);
  });
});

describe('shrinkPpg', () => {
  it('pulls a short sample toward last season, and a long one barely', () => {
    const production = new Map<string, SeasonProduction>([
      ['hot', { ppg: 25, games: 2, priorPpg: 10, priorGames: 17 }],
      ['steady', { ppg: 25, games: 16, priorPpg: 10, priorGames: 17 }],
    ]);
    const shrunk = shrinkPpg(production, () => 'WR', ['hot', 'steady'], { yoyR: 0.78, shrinkK: 1.14 });
    expect(shrunk.get('hot')!).toBeLessThan(18);
    expect(shrunk.get('steady')!).toBeGreaterThan(21);
  });
});

describe('marketFormat', () => {
  it('reads superflex, PPR and dynasty off the league', () => {
    expect(marketFormat({ ...league, rosterSlots: [...SLOTS, 'SUPER_FLEX'], scoringFormat: { rec: 0.5 }, leagueType: 'dynasty' }))
      .toEqual({ isDynasty: true, numQbs: 2, numTeams: 4, ppr: 0.5 });
    expect(marketFormat({ ...league, platform: 'espn', scoringFormat: { '53': 1 } }).ppr).toBe(1);
  });
});

describe('ageMultiplier', () => {
  it('fades running backs before quarterbacks', () => {
    expect(ageMultiplier('RB', 29)).toBeLessThan(ageMultiplier('QB', 29));
    expect(ageMultiplier('WR', null)).toBe(1);
  });
});

describe('tradeRadar', () => {
  it('finds the complementary deal: my spare WR for their spare RB', () => {
    const result = tradeRadar(build());
    expect(result.mode).toBe('buyer');
    const rb = result.partners.find((p) => p.externalTeamId === 'rb');
    expect(rb).toBeDefined();
    expect(rb!.needs).toContain('WR');
    expect(result.myNeeds).toContain('RB');
    const best = rb!.packages[0]!;
    expect(best.give.every((a) => a.position === 'WR')).toBe(true);
    expect(best.get.some((a) => a.position === 'RB')).toBe(true);
    expect(best.you.lineup).toBeGreaterThan(0);
    expect(best.them.lineup).toBeGreaterThanOrEqual(0);
    expect(Math.abs(best.fairness.diff)).toBeLessThanOrEqual(0.15);
    expect(best.fairness.basis).toBe('market');
  });

  it('caps partners, packages per partner, and repeats of one target', () => {
    const result = tradeRadar(build());
    expect(result.partners.length).toBeLessThanOrEqual(3);
    const targets = new Map<string, number>();
    for (const p of result.partners) {
      expect(p.packages.length).toBeLessThanOrEqual(3);
      for (const pkg of p.packages) for (const a of pkg.get) targets.set(a.externalPlayerId, (targets.get(a.externalPlayerId) ?? 0) + 1);
    }
    expect(Math.max(...targets.values())).toBeLessThanOrEqual(2);
  });

  it('judges fairness on our value when the market is muted or down', () => {
    expect(tradeRadar({ ...build(), useMarket: false }).market).toBe('off');
    const down = tradeRadar({ ...build(), market: null });
    expect(down.market).toBe('unavailable');
    for (const p of down.partners) for (const pkg of p.packages) expect(pkg.fairness.basis).toBe('ours');
  });

  it('suggests seller when well out of the playoff spots', () => {
    const result = tradeRadar(build({ me: [1, 6], rb: [6, 1], mid: [5, 2], low: [4, 3] }));
    expect(result.suggestedMode).toBe('seller');
    expect(result.suggestionReason).toMatch(/1-6, 4th, 4 games out → seller/);
  });

  it('never trades kickers or defenses, and an explicit mode wins', () => {
    const input = build();
    input.players.set('me-k', { externalPlayerId: 'me-k', fullName: 'K', position: 'K', nflTeam: 'KC', injuryStatus: null, byeWeek: 7, projectedPoints: null });
    input.rosters[0]!.entries.push({ externalPlayerId: 'me-k', slot: 'starter' });
    const result = tradeRadar({ ...input, mode: 'seller' });
    expect(result.mode).toBe('seller');
    for (const p of result.partners) for (const pkg of p.packages) expect(pkg.give.map((a) => a.position)).not.toContain('K');
  });

  it('says why when nothing qualifies', () => {
    const input = build();
    // Shrink everyone's market to zero but mine: no deal is fair.
    for (const [id, v] of input.market!) if (!id.startsWith('me-')) input.market!.set(id, { ...v, value: 1 });
    const result = tradeRadar(input);
    expect(result.partners).toEqual([]);
    expect(result.emptyReason).toMatch(/within 15%/);
  });
});
