import { describe, expect, it } from 'vitest';
import type { TeamGiveawayAggregate } from '../../types/nflverse.js';
import { offenseGiveawayRatings, priorSeasonWeight } from './offense-giveaway.js';

function aggregate(overrides: Partial<TeamGiveawayAggregate>): TeamGiveawayAggregate {
  return {
    team: 'XXX',
    games: 4,
    dropbacks: 100,
    plays: 200,
    sacksAllowed: 10,
    interceptions: 4,
    fumblesLost: 2,
    points: 80,
    ...overrides,
  };
}

describe('priorSeasonWeight', () => {
  it('decays the prior season away by week 5', () => {
    expect(priorSeasonWeight(1)).toBe(0.8);
    expect(priorSeasonWeight(2)).toBe(0.6);
    expect(priorSeasonWeight(4)).toBe(0.2);
    expect(priorSeasonWeight(5)).toBe(0);
    expect(priorSeasonWeight(14)).toBe(0);
  });

  it('leans entirely on the prior season before a season starts', () => {
    expect(priorSeasonWeight(0)).toBe(1);
  });
});

describe('offenseGiveawayRatings', () => {
  const soft = aggregate({ team: 'SOF', sacksAllowed: 20, interceptions: 10, points: 40 });
  const tough = aggregate({ team: 'TUF', sacksAllowed: 2, interceptions: 0, fumblesLost: 0, points: 140 });
  const middling = aggregate({ team: 'MID' });

  it('ranks the most generous offense first', () => {
    const ratings = offenseGiveawayRatings([tough, middling, soft]);
    const byTeam = new Map(ratings.map((r) => [r.team, r]));
    expect(byTeam.get('SOF')).toMatchObject({ rank: 1, score: 100, pressure: 100, turnovers: 100 });
    expect(byTeam.get('TUF')).toMatchObject({ rank: 3, score: 0 });
    const mid = byTeam.get('MID');
    expect(mid?.rank).toBe(2);
    expect(mid?.score).toBeGreaterThan(0);
    expect(mid?.score).toBeLessThan(100);
  });

  it('scores a team with no plays yet as the toughest possible matchup', () => {
    const empty = aggregate({
      team: 'NEW',
      games: 0,
      dropbacks: 0,
      plays: 0,
      sacksAllowed: 0,
      interceptions: 0,
      fumblesLost: 0,
      points: 0,
    });
    const ratings = offenseGiveawayRatings([empty, soft, tough]);
    const rating = ratings.find((r) => r.team === 'NEW');
    // No evidence must not read as "soft" — every facet lands at the worst end.
    expect(rating).toMatchObject({ score: 0, pressure: 0, turnovers: 0, scoring: 0, games: 0 });
  });

  it('gives everyone a neutral 50 when no team has any data', () => {
    const blank = aggregate({ games: 0, dropbacks: 0, plays: 0 });
    const ratings = offenseGiveawayRatings([
      { ...blank, team: 'AAA' },
      { ...blank, team: 'BBB' },
    ]);
    expect(ratings.map((r) => r.score)).toEqual([50, 50]);
    expect(ratings.map((r) => r.rank)).toEqual([1, 1]);
  });

  it('rounds blended fractional games for display', () => {
    const [rating] = offenseGiveawayRatings([aggregate({ games: 6.25 })]);
    expect(rating?.games).toBe(6.3);
  });
});
