import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { TeamGiveawayAggregate } from '../../types/nflverse.js';
import { aggregateGiveaway, blendGiveaway, parseTeamWeekCsv } from './team-stats.js';

const sampleCsv = readFileSync(
  fileURLToPath(new URL('./__fixtures__/team-week-sample.csv', import.meta.url)),
  'utf8',
);

const rows = parseTeamWeekCsv(sampleCsv);

describe('aggregateGiveaway', () => {
  it('aggregates per offense, sorted by normalized team code', () => {
    expect(aggregateGiveaway(rows)).toEqual([
      // 29+30 att, 5+3 sacks -> 67 dropbacks; +47 carries -> 114 plays.
      // points: (2*6 + 2*3 + 2) + (2*6 + 1*3 + 2) = 20 + 17
      {
        team: 'ARI',
        games: 2,
        dropbacks: 67,
        plays: 114,
        sacksAllowed: 8,
        interceptions: 2,
        fumblesLost: 1,
        points: 37,
      },
      // LA -> LAR; week 1 carries a passing 2pt conversion (22 pts), week 2 three FGs (30).
      {
        team: 'LAR',
        games: 2,
        dropbacks: 78,
        plays: 118,
        sacksAllowed: 3,
        interceptions: 1,
        fumblesLost: 1,
        points: 52,
      },
      // The POST row is excluded; the week-2 row with no opponent still counts.
      {
        team: 'SF',
        games: 2,
        dropbacks: 65,
        plays: 119,
        sacksAllowed: 6,
        interceptions: 4,
        fumblesLost: 2,
        points: 25,
      },
    ]);
  });

  it('skips rows with no team and rows with no parseable week', () => {
    const teams = aggregateGiveaway(rows).map((a) => a.team);
    expect(teams).not.toContain('NA');
    // The WSH row has an empty week cell, so it never reaches the WAS bucket.
    expect(teams).not.toContain('WAS');
  });

  it('excludes games past throughWeek', () => {
    const week1 = aggregateGiveaway(rows, { throughWeek: 1 });
    expect(week1.map((a) => a.games)).toEqual([1, 1, 1]);
    expect(week1[0]).toMatchObject({ team: 'ARI', sacksAllowed: 5, points: 20 });
  });

  it('returns nothing when the cutoff precedes every game', () => {
    expect(aggregateGiveaway(rows, { throughWeek: 0 })).toEqual([]);
  });
});

describe('blendGiveaway', () => {
  const current = aggregateGiveaway(rows, { throughWeek: 1 });
  const prior = aggregateGiveaway(rows);

  it('scales the prior season down to the current sample before blending', () => {
    const blended = blendGiveaway(current, prior, 0.5);
    // Equal weights means equal effective samples: 3 current games, 3 prior games.
    const games = (aggs: typeof blended) => aggs.reduce((sum, a) => sum + a.games, 0);
    expect(games(blended)).toBeCloseTo(6);
    expect(blended.map((a) => a.team)).toEqual(['ARI', 'LAR', 'SF']);
  });

  it('pulls a blended rate from the current season toward the prior one as the weight rises', () => {
    const sackRate = (aggs: TeamGiveawayAggregate[], team: string): number => {
      const agg = aggs.find((a) => a.team === team) as TeamGiveawayAggregate;
      return agg.sacksAllowed / agg.dropbacks;
    };
    // ARI takes sacks at 5/34 in the week-1 sample and 8/67 across both weeks.
    const currentRate = sackRate(current, 'ARI');
    const priorRate = sackRate(prior, 'ARI');
    const at = (weight: number) => sackRate(blendGiveaway(current, prior, weight), 'ARI');

    expect(at(0.5)).toBeGreaterThan(priorRate);
    expect(at(0.5)).toBeLessThan(currentRate);
    // The scale is taken from league-wide games, so a team whose dropbacks-per-game sits off
    // the league average lands near the midpoint rather than exactly on it.
    expect(at(0.5)).toBeCloseTo((currentRate + priorRate) / 2, 3);
    expect(at(0.8)).toBeLessThan(at(0.5));
    expect(at(0.2)).toBeGreaterThan(at(0.5));
  });

  it('keeps a team present in only one of the two seasons', () => {
    const blended = blendGiveaway(current.slice(0, 1), prior, 0.5);
    expect(blended.map((a) => a.team)).toEqual(['ARI', 'LAR', 'SF']);
    // Prior-only teams carry last year's rates, whatever their scaled counts come to.
    const lar = blended.find((a) => a.team === 'LAR') as TeamGiveawayAggregate;
    const priorLar = prior.find((a) => a.team === 'LAR') as TeamGiveawayAggregate;
    expect(lar.sacksAllowed / lar.dropbacks).toBeCloseTo(
      priorLar.sacksAllowed / priorLar.dropbacks,
      6,
    );
  });

  it('returns the current season untouched at weight 0', () => {
    expect(blendGiveaway(current, prior, 0)).toBe(current);
  });

  it('falls back to the prior season when there is nothing current to blend', () => {
    expect(blendGiveaway([], prior, 0.5)).toBe(prior);
    expect(blendGiveaway(current, prior, 1)).toBe(prior);
  });
});
