import { describe, expect, it } from 'vitest';
import type { League, Player, Roster } from '../types/league.js';
import type { GameConditions, GameWeather } from '../types/weather.js';
import { buildWeatherSection, type LeagueDigestEntry } from './digest.js';
import { weatherRiskFlags } from './flags/weather-risk.js';
import { assessConditions, weatherExposure, weatherSummary } from './weather.js';

function conditions(overrides: Partial<GameConditions> = {}): GameConditions {
  return {
    tempF: 65,
    windMph: 5,
    gustMph: 10,
    rainIn: 0,
    snowIn: 0,
    precipChance: 0,
    condition: null,
    ...overrides,
  };
}

function game(c: GameConditions | null, overrides: Partial<GameWeather> = {}): GameWeather {
  return {
    home: 'GB',
    away: 'HOU',
    kickoff: '2026-12-20T18:00:00.000Z',
    state: 'pre',
    venueName: 'Lambeau Field',
    roof: 'open',
    source: 'forecast',
    conditions: c,
    ...assessConditions(c),
    ...overrides,
  };
}

describe('assessConditions', () => {
  it('says nothing about a calm day', () => {
    expect(assessConditions(conditions())).toEqual({ severity: 'none', notes: [] });
  });

  it('grades wind notable, then harsh', () => {
    expect(assessConditions(conditions({ windMph: 16 })).severity).toBe('notable');
    const harsh = assessConditions(conditions({ windMph: 22 }));
    expect(harsh.severity).toBe('harsh');
    expect(harsh.notes[0]).toMatchObject({ kind: 'wind', label: 'Wind 22 mph' });
  });

  it('reads cold as worse going down, and orders harsh first', () => {
    const { notes } = assessConditions(conditions({ tempF: 12, windMph: 16 }));
    expect(notes.map((n) => [n.kind, n.severity])).toEqual([
      ['cold', 'harsh'],
      ['wind', 'notable'],
    ]);
  });

  it('never calls heat harsh', () => {
    expect(assessConditions(conditions({ tempF: 101 })).severity).toBe('notable');
  });

  it('reads a sentence only for kinds the numbers left open', () => {
    // ESPN-only: a temperature and "Light rain" — the phrase is the only rain reading there is.
    const espn = assessConditions({ ...conditions({ rainIn: null, snowIn: null, windMph: null, gustMph: null }), condition: 'Light rain' });
    expect(espn.notes).toMatchObject([{ kind: 'rain', severity: 'notable', label: 'Light rain' }]);

    // A forecast measured zero rain — the sentence doesn't overrule it.
    expect(assessConditions(conditions({ condition: 'Light rain' })).severity).toBe('none');
  });

  it('is silent with no conditions at all', () => {
    expect(assessConditions(null).severity).toBe('none');
  });
});

describe('weatherExposure / weatherRiskFlags', () => {
  const players = new Map<string, Player>(
    [
      { externalPlayerId: 'qb', fullName: 'Q Back', position: 'QB', nflTeam: 'GB' },
      { externalPlayerId: 'rb', fullName: 'R Back', position: 'RB', nflTeam: 'HOU' },
      { externalPlayerId: 'k', fullName: 'Kicker', position: 'K', nflTeam: 'TB' },
      { externalPlayerId: 'bench-wr', fullName: 'Bench WR', position: 'WR', nflTeam: 'GB' },
    ].map((p) => [p.externalPlayerId, { injuryStatus: null, byeWeek: null, projectedPoints: null, ...p }]),
  );
  const roster: Roster = {
    externalTeamId: '1',
    entries: [
      { externalPlayerId: 'qb', slot: 'starter' },
      { externalPlayerId: 'rb', slot: 'starter' },
      { externalPlayerId: 'k', slot: 'starter' },
      { externalPlayerId: 'bench-wr', slot: 'bench' },
    ],
  };
  const windy = game(conditions({ windMph: 24 }));
  const wet = game(conditions({ rainIn: 0.05 }), { home: 'TB', away: 'CLE', venueName: 'Raymond James Stadium' });
  const weather = new Map([
    ['GB', windy],
    ['HOU', windy],
    ['TB', wet],
    ['CLE', wet],
  ]);

  it('reaches only starters whose position the weather touches', () => {
    // RB is in the same windy game as the QB but wind doesn't touch the run game; the WR is benched.
    expect(weatherExposure(roster, players, weather).map((e) => [e.playerId, e.severity])).toEqual([
      ['qb', 'harsh'],
      ['k', 'notable'],
    ]);
  });

  it('skips games already underway', () => {
    const live = new Map([['GB', { ...windy, state: 'in' as const }]]);
    expect(weatherExposure(roster, players, live)).toEqual([]);
  });

  it('flags harsh exposure only', () => {
    const flags = weatherRiskFlags(roster, players, weather);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({
      type: 'WEATHER_RISK',
      level: 'warning',
      playerId: 'qb',
      message: 'Q Back (QB) plays in wind 24 mph at Lambeau Field',
    });
  });

  it('summarizes a game in one line', () => {
    expect(weatherSummary(game(conditions({ windMph: 24, snowIn: 0.1 })))).toBe('Wind 24 mph · Snow');
    expect(weatherSummary(game(conditions()))).toBeNull();
  });

  it('writes one email line per game, harsh games first', () => {
    const league = { name: 'Home League' } as League;
    const entry = {
      league,
      weather: weatherExposure(roster, players, weather),
    } as LeagueDigestEntry;
    expect(buildWeatherSection([entry]).lines).toEqual([
      'Home League',
      '    HOU @ GB — Wind 24 mph: Q Back (QB)',
      '    CLE @ TB — Rain: Kicker (K)',
    ]);
    expect(buildWeatherSection([{ ...entry, weather: [] }]).lines).toEqual([
      'No weather worth noting for your starters.',
    ]);
  });
});
