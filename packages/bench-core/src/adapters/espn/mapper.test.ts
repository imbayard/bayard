import { describe, expect, it } from 'vitest';
import {
  mapLeague,
  mapMatchups,
  mapPlayer,
  mapProjections,
  mapRoster,
  mapTeams,
  normalizeInjuryStatus,
} from './mapper.js';
import type {
  EspnLeagueResponse,
  EspnPlayerInfoResponse,
  EspnPlayerPool,
  EspnProPlayer,
  EspnTeamDetail,
} from './types.js';
import fixture from './__fixtures__/league.json';
import projFixture from './__fixtures__/player-projections.json';

const leagueData = fixture.league as EspnLeagueResponse;
const teams = leagueData.teams as EspnTeamDetail[];
const players = fixture.players as Record<string, EspnProPlayer>;

describe('mapLeague', () => {
  it('normalizes league metadata', () => {
    const result = mapLeague(leagueData);
    expect(result).toEqual({
      platform: 'espn',
      externalLeagueId: '123456789',
      name: 'Fixture ESPN League',
      season: 2025,
      scoringFormat: { '53': 1, '4': 4, '25': 6 },
      leagueType: 'redraft',
      rosterSlots: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'DEF', 'BN', 'BN'],
      teamCount: 2,
      currentWeek: 3,
    });
  });

  it('detects keeper league', () => {
    const keeper = {
      ...leagueData,
      settings: {
        ...leagueData.settings,
        keeperCount: 2,
      },
    } as EspnLeagueResponse;
    expect(mapLeague(keeper).leagueType).toBe('keeper');
  });
});

describe('mapTeams', () => {
  it('joins teams with records', () => {
    const result = mapTeams(teams);
    expect(result[0]).toEqual({
      externalTeamId: '1',
      ownerExternalUserId: '550e8400-e29b-41d4-a716-446655440000',
      displayName: 'Bench Mob',
      wins: 2,
      losses: 1,
      ties: 0,
      pointsFor: 342.5,
      pointsAgainst: 300.1,
    });
    expect(result[1]?.displayName).toBe('Second Team');
  });
});

describe('mapRoster', () => {
  it('classifies starters, bench, ir; tags starters with their specific lineup slot', () => {
    const roster = mapRoster(teams[0]!, []);
    expect(roster.externalTeamId).toBe('1');
    expect(roster.entries).toEqual([
      { externalPlayerId: '16747', slot: 'starter', positionSlot: 'QB' },
      { externalPlayerId: '16745', slot: 'starter', positionSlot: 'WR' },
      { externalPlayerId: '99999', slot: 'starter', positionSlot: 'DEF' },
      { externalPlayerId: '16748', slot: 'bench', positionSlot: null },
      { externalPlayerId: '16750', slot: 'bench', positionSlot: null },
      { externalPlayerId: '16751', slot: 'ir', positionSlot: null },
    ]);
  });

  it('handles missing roster', () => {
    const noRoster = { ...teams[1], roster: undefined } as EspnTeamDetail;
    const roster = mapRoster(noRoster, []);
    expect(roster.entries).toEqual([]);
  });
});

describe('mapMatchups', () => {
  it('pairs teams from schedule', () => {
    const result = mapMatchups(leagueData, 3);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      week: 3,
      externalTeamId: '1',
      opponentExternalTeamId: '2',
      points: 87.4,
      projectedPoints: null,
    });
    expect(result[1]).toEqual({
      week: 3,
      externalTeamId: '2',
      opponentExternalTeamId: '1',
      points: 92.1,
      projectedPoints: null,
    });
  });

  it('filters by week', () => {
    const result = mapMatchups(leagueData, 10);
    expect(result).toEqual([]);
  });
});

describe('mapPlayer', () => {
  it('normalizes a skill player with title-cased injury status', () => {
    const result = mapPlayer(16745, players['16745']!);
    expect(result).toEqual({
      externalPlayerId: '16745',
      fullName: 'Justin Jefferson',
      position: 'WR',
      nflTeam: 'MIN',
      injuryStatus: 'Questionable',
      byeWeek: null,
      projectedPoints: null,
    });
  });

  it('normalizes team defense position', () => {
    const result = mapPlayer(99999, players['99999']!);
    expect(result.fullName).toBe('Buffalo Bills');
    expect(result.position).toBe('DEF');
    expect(result.nflTeam).toBe('BUF');
  });

  it('falls back to first+last when fullName missing', () => {
    const partial = {
      id: 16748,
      firstName: 'Travis',
      lastName: 'Kelce',
      proTeamId: 12,
      defaultPositionId: 4,
    } as EspnProPlayer;
    const result = mapPlayer(16748, partial);
    expect(result.fullName).toBe('Travis Kelce');
  });
});

describe('mapProjections', () => {
  it('picks the weekly projected appliedTotal, skipping actual/season entries and missing players', () => {
    const result = mapProjections(projFixture as EspnPlayerInfoResponse, 5);
    expect(result.get('1001')).toBe(17.4);
    expect(result.get('1002')).toBe(9.8);
    expect(result.has('1003')).toBe(false);
  });
});

describe('normalizeInjuryStatus', () => {
  it('title-cases words', () => {
    expect(normalizeInjuryStatus('questionable')).toBe('Questionable');
    expect(normalizeInjuryStatus('out')).toBe('Out');
    expect(normalizeInjuryStatus('day_to_day')).toBe('Day To Day');
  });

  it('nulls empties', () => {
    expect(normalizeInjuryStatus('')).toBeNull();
    expect(normalizeInjuryStatus(null)).toBeNull();
    expect(normalizeInjuryStatus(undefined)).toBeNull();
  });
});
