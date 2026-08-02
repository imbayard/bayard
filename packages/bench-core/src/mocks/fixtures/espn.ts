/**
 * Raw ESPN API response fixtures — shaped exactly like what `EspnClient` would get back from a
 * real `fetch()`, before any mapping. `MockEspnClient` (../espn-client.ts) serves these in place
 * of the real HTTP calls; everything downstream (the real `EspnAdapter` + mapper) runs unchanged.
 */
import type { EspnLeagueResponse, EspnPlayerPool } from '../../adapters/espn/types.js';

export const MOCK_ESPN_OWNER_ID = 'mock-espn-owner';
export const MOCK_ESPN_LEAGUE_ID = '100000001';
export const MOCK_ESPN_SEASON = 2026;

const MOCK_CURRENT_WEEK = 7;

export const espnLeague: EspnLeagueResponse = {
  id: Number(MOCK_ESPN_LEAGUE_ID),
  name: 'The League of Extraordinary Grudges',
  season: MOCK_ESPN_SEASON,
  scoringPeriodId: MOCK_CURRENT_WEEK,
  status: { latestScoringPeriod: MOCK_CURRENT_WEEK },
  settings: {
    scoringSettings: {
      // ESPN keys scoring by numeric statId under scoringItems (53=rec, 4=passTD, 25=rushTD, 43=recTD).
      scoringItems: [
        { statId: 53, points: 0.5 },
        { statId: 4, points: 4 },
        { statId: 25, points: 6 },
        { statId: 43, points: 6 },
      ],
    },
    // QB, RB x2, WR x2, TE, FLEX, K, DEF, BN x3 — same shape as the Sleeper mock leagues' roster.
    rosterSettings: { lineupSlotCounts: { 0: 1, 2: 2, 4: 2, 5: 1, 6: 1, 7: 1, 8: 1, 9: 3 } },
    keeperCount: 0,
  },
  teams: [
    {
      id: 1,
      abbrev: 'LEG',
      name: 'League of Extraordinary Grudges',
      points: 812.4,
      record: { overall: { wins: 3, losses: 3, ties: 0, pointsFor: 812.4, pointsAgainst: 790.2 } },
      owners: [{ id: MOCK_ESPN_OWNER_ID }],
      roster: {
        // Fills QB/RB/WR/WR/TE; leaves the 2nd RB, FLEX, K, DEF unfilled -> 4 INCOMPLETE_LINEUP flags.
        entries: [
          { playerId: 90001, lineupSlotId: 0, status: 'ACTIVE' },
          { playerId: 90002, lineupSlotId: 2, status: 'ACTIVE' },
          { playerId: 90003, lineupSlotId: 4, status: 'ACTIVE' },
          { playerId: 90004, lineupSlotId: 4, status: 'ACTIVE' },
          { playerId: 90005, lineupSlotId: 5, status: 'ACTIVE' },
          { playerId: 90006, lineupSlotId: 9, status: 'BENCH' },
        ],
      },
    },
    {
      id: 2,
      abbrev: 'TITN',
      name: 'Turf Titans',
      points: 790.2,
      record: { overall: { wins: 4, losses: 2, ties: 0, pointsFor: 790.2, pointsAgainst: 812.4 } },
      owners: [{ id: 'mock-espn-opp-owner' }],
      roster: {
        entries: [{ playerId: 90007, lineupSlotId: 0, status: 'ACTIVE' }],
      },
    },
  ],
  schedule: [
    {
      id: 1,
      matchupPeriodId: MOCK_CURRENT_WEEK,
      away: { teamId: 1, points: 0 },
      home: { teamId: 2, points: 91.8 },
    },
  ],
};

export const espnPlayerPool: EspnPlayerPool = [
  { id: 90001, fullName: 'Bram Castillo', proTeamId: 29, defaultPositionId: 1 },
  { id: 90002, fullName: 'Foster Nash', proTeamId: 23, defaultPositionId: 2 },
  { id: 90003, fullName: 'Elias Thorne', proTeamId: 30, defaultPositionId: 3 },
  { id: 90004, fullName: 'Bo Redding', proTeamId: 3, defaultPositionId: 3 },
  { id: 90005, fullName: 'Hutton Vance', proTeamId: 17, defaultPositionId: 4 },
  { id: 90006, fullName: 'Rory Sallis', proTeamId: 7, defaultPositionId: 2 },
  { id: 90007, fullName: 'Nate Bellamy', proTeamId: 10, defaultPositionId: 1 },
];
