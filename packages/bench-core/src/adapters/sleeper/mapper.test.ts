import { describe, expect, it } from 'vitest';
import {
  draftSlotForPick,
  mapDraft,
  mapDraftPicks,
  mapLeague,
  mapMatchups,
  mapPlayer,
  mapProjections,
  mapRoster,
  mapTeams,
  normalizeInjuryStatus,
} from './mapper.js';
import type {
  SleeperDraft,
  SleeperDraftPick,
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
    const result = mapLeague(league, 3, '2025-08-21T00:00:00.000Z', 'pre_draft');
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
      draftDate: '2025-08-21T00:00:00.000Z',
      draftStatus: 'pre_draft',
    });
  });

  it('sets draftDate to null when the draft is unscheduled', () => {
    expect(mapLeague(league, 3, null, null).draftDate).toBeNull();
  });

  it('detects bestball over dynasty', () => {
    const bestball = { ...league, settings: { ...league.settings, best_ball: 1 } };
    expect(mapLeague(bestball, 3, null, null).leagueType).toBe('bestball');
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
        anyStarterStarted: false,
        firstStarterKickoff: null,
        firstPlayerKickoff: null,
      },
      {
        week: 3,
        externalTeamId: '2',
        opponentExternalTeamId: '1',
        points: 92.1,
        projectedPoints: null,
        anyStarterStarted: false,
        firstStarterKickoff: null,
        firstPlayerKickoff: null,
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

const runningDraft: SleeperDraft = {
  draft_id: 'd1',
  league_id: 'l1',
  status: 'drafting',
  type: 'snake',
  season: '2026',
  settings: { teams: 4, rounds: 3, reversal_round: 0 },
  start_time: 1787270400000,
  last_picked: 1787271900000,
  slot_to_roster_id: { '1': 7, '2': 3, '3': 5, '4': 9 },
};

describe('mapDraft', () => {
  it('normalizes the draft and derives who is on the clock', () => {
    const result = mapDraft(runningDraft, 5);

    expect(result).toEqual({
      externalDraftId: 'd1',
      externalLeagueId: 'l1',
      status: 'drafting',
      type: 'snake',
      rounds: 3,
      teamCount: 4,
      startTime: '2026-08-21T00:00:00.000Z',
      lastPickedAt: '2026-08-21T00:25:00.000Z',
      slotByTeamId: { '7': 1, '3': 2, '5': 3, '9': 4 },
      totalPicks: 12,
      madePicks: 5,
      currentPickNo: 6,
      // Pick 6 is round 2 of a snake, third from the end -> slot 3 -> roster 5
      onTheClockTeamId: '5',
    });
  });

  it('has nobody on the clock before the draft starts or once it is over', () => {
    expect(mapDraft({ ...runningDraft, status: 'pre_draft' }, 0).currentPickNo).toBeNull();
    expect(mapDraft({ ...runningDraft, status: 'complete' }, 12).onTheClockTeamId).toBeNull();
    expect(mapDraft(runningDraft, 12).currentPickNo).toBeNull();
  });

  it('falls back to an empty board when the draft order is not set yet', () => {
    const result = mapDraft({ ...runningDraft, status: 'pre_draft', slot_to_roster_id: null }, 0);
    expect(result.slotByTeamId).toEqual({});
    expect(result.onTheClockTeamId).toBeNull();
  });
});

describe('draftSlotForPick', () => {
  it('alternates direction each round for a snake', () => {
    const slots = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => draftSlotForPick(n, 4, 'snake', 0));
    expect(slots).toEqual([1, 2, 3, 4, 4, 3, 2, 1]);
  });

  it('repeats the reversed round when third-round reversal is on', () => {
    const rounds = [1, 2, 3, 4].map((r) =>
      [1, 2, 3, 4].map((i) => draftSlotForPick((r - 1) * 4 + i, 4, 'snake', 3)),
    );
    expect(rounds).toEqual([
      [1, 2, 3, 4],
      [4, 3, 2, 1],
      [4, 3, 2, 1],
      [1, 2, 3, 4],
    ]);
  });

  it('keeps one order every round for linear, and has no board for auction', () => {
    expect([5, 6, 7, 8].map((n) => draftSlotForPick(n, 4, 'linear', 0))).toEqual([1, 2, 3, 4]);
    expect(draftSlotForPick(1, 4, 'auction', 0)).toBeNull();
  });
});

describe('mapDraftPicks', () => {
  const pick = (over: Partial<SleeperDraftPick>): SleeperDraftPick => ({
    draft_id: 'd1',
    player_id: '4984',
    pick_no: 1,
    round: 1,
    draft_slot: 1,
    picked_by: 'u1',
    roster_id: 7,
    is_keeper: null,
    metadata: { first_name: 'Josh', last_name: 'Allen', position: 'QB', team: 'BUF', injury_status: '' },
    ...over,
  });

  it('sorts by pick, flattens player metadata, and normalizes keepers', () => {
    const result = mapDraftPicks([pick({ pick_no: 2, draft_slot: 2, roster_id: 3 }), pick({})], {
      '7': 1,
      '3': 2,
    });

    expect(result.map((p) => p.pickNo)).toEqual([1, 2]);
    expect(result[0]).toEqual({
      pickNo: 1,
      round: 1,
      slot: 1,
      externalTeamId: '7',
      externalPlayerId: '4984',
      playerName: 'Josh Allen',
      position: 'QB',
      nflTeam: 'BUF',
      isKeeper: false,
    });
  });

  it('identifies the team by board slot when the pick carries no roster', () => {
    const [result] = mapDraftPicks([pick({ roster_id: null, draft_slot: 2 })], { '7': 1, '3': 2 });
    expect(result?.externalTeamId).toBe('3');
  });

  it('falls back to the player id when the pick has no name metadata', () => {
    const [result] = mapDraftPicks([pick({ metadata: null })], {});
    expect(result?.playerName).toBe('4984');
    expect(result?.position).toBe('UNK');
    expect(result?.nflTeam).toBeNull();
  });
});
