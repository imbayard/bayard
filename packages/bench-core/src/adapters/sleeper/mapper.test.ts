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
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperPlayersResponse,
  SleeperProjectionsResponse,
  SleeperRoster,
} from './types.js';
import fixture from './__fixtures__/league.json';

const league = fixture.league as SleeperLeague;
const users = fixture.users as SleeperLeagueUser[];
const rosters = fixture.rosters as SleeperRoster[];
const matchups = fixture.matchups as SleeperMatchup[];
const players = fixture.players as SleeperPlayersResponse;

describe('mapLeague', () => {
  it('normalizes league metadata', () => {
    const result = mapLeague(league, 3);
    expect(result).toEqual({
      platform: 'sleeper',
      externalLeagueId: '9999999999',
      name: 'Fixture Dynasty League',
      season: 2025,
      scoringFormat: { rec: 1, pass_td: 4, rush_td: 6 },
      leagueType: 'dynasty',
      rosterSlots: ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN', 'BN'],
      teamCount: 2,
      currentWeek: 3,
    });
  });

  it('detects bestball over dynasty', () => {
    const bestball = { ...league, settings: { ...league.settings, best_ball: 1 } };
    expect(mapLeague(bestball, 3).leagueType).toBe('bestball');
  });
});

describe('mapTeams', () => {
  it('joins rosters with owners and combines fractional points', () => {
    const teams = mapTeams(rosters, users);
    expect(teams[0]).toEqual({
      externalTeamId: '1',
      ownerExternalUserId: 'u1',
      displayName: 'Bench Mob',
      wins: 2,
      losses: 1,
      ties: 0,
      pointsFor: 312.42,
      pointsAgainst: 280.1,
    });
    // no team_name in metadata → falls back to display_name
    expect(teams[1]?.displayName).toBe('rival');
  });
});

describe('mapRoster', () => {
  it('classifies starters, bench, ir, and taxi; tags starters with their slot label; drops empty "0" slots', () => {
    const roster = mapRoster(rosters[0]!, ['QB', 'RB', 'WR']);
    expect(roster.externalTeamId).toBe('1');
    expect(roster.entries).toEqual([
      { externalPlayerId: '4046', slot: 'starter', positionSlot: 'QB' },
      { externalPlayerId: '6794', slot: 'starter', positionSlot: 'RB' },
      { externalPlayerId: 'BUF', slot: 'bench', positionSlot: null },
      { externalPlayerId: '1234', slot: 'ir', positionSlot: null },
      { externalPlayerId: '9509', slot: 'taxi', positionSlot: null },
    ]);
  });

  it('handles null reserve/taxi', () => {
    const roster = mapRoster(rosters[1]!, ['QB']);
    expect(roster.entries).toEqual([
      { externalPlayerId: '4034', slot: 'starter', positionSlot: 'QB' },
      { externalPlayerId: '5849', slot: 'bench', positionSlot: null },
    ]);
  });
});

describe('mapMatchups', () => {
  it('pairs opponents by matchup_id', () => {
    const result = mapMatchups(matchups, 3);
    expect(result).toEqual([
      {
        week: 3,
        externalTeamId: '1',
        opponentExternalTeamId: '2',
        points: 87.4,
        projectedPoints: null,
      },
      {
        week: 3,
        externalTeamId: '2',
        opponentExternalTeamId: '1',
        points: 92.1,
        projectedPoints: null,
      },
    ]);
  });

  it('marks byes with null opponent', () => {
    const bye: SleeperMatchup[] = [{ roster_id: 1, matchup_id: null, points: 50 }];
    expect(mapMatchups(bye, 3)[0]?.opponentExternalTeamId).toBeNull();
  });
});

describe('mapPlayer', () => {
  it('normalizes a skill player with title-cased injury status', () => {
    expect(mapPlayer('6794', players['6794']!)).toEqual({
      externalPlayerId: '6794',
      fullName: 'Justin Jefferson',
      position: 'WR',
      nflTeam: 'MIN',
      injuryStatus: 'Questionable',
      byeWeek: 6,
      projectedPoints: null,
    });
  });

  it('assembles team defense names from first/last and keeps DEF position', () => {
    const def = mapPlayer('BUF', players['BUF']!);
    expect(def.fullName).toBe('Buffalo Bills');
    expect(def.position).toBe('DEF');
    expect(def.byeWeek).toBeNull();
  });
});

describe('mapProjections', () => {
  it('keys pts_ppr by player_id, skipping entries with no pts_ppr', () => {
    const raw: SleeperProjectionsResponse = [
      { player_id: '6794', stats: { pts_ppr: 14.2, pts_std: 9.8 } },
      { player_id: '4046', stats: { pts_std: 12.0 } },
    ];

    const result = mapProjections(raw);

    expect(result.get('6794')).toBe(14.2);
    expect(result.has('4046')).toBe(false);
  });
});

describe('normalizeInjuryStatus', () => {
  it('title-cases words, keeps acronyms, nulls empties', () => {
    expect(normalizeInjuryStatus('questionable')).toBe('Questionable');
    expect(normalizeInjuryStatus('OUT')).toBe('Out');
    expect(normalizeInjuryStatus('ir')).toBe('IR');
    expect(normalizeInjuryStatus('')).toBeNull();
    expect(normalizeInjuryStatus(null)).toBeNull();
    expect(normalizeInjuryStatus(undefined)).toBeNull();
  });
});
