/**
 * Raw Sleeper API response fixtures — shaped exactly like what `SleeperClient` would get back
 * from a real `fetch()`, before any mapping. `MockSleeperClient` (../sleeper-client.ts) serves
 * these in place of the real HTTP calls; everything downstream (the real `SleeperAdapter` +
 * mapper) runs unchanged, so mock mode exercises the same normalization code as production.
 */
import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperNflState,
  SleeperPlayersResponse,
  SleeperProjectionsResponse,
  SleeperRoster,
} from '../../adapters/sleeper/types.js';

export const MOCK_SLEEPER_OWNER_ID = 'mock-sleeper-owner';

const MOCK_CURRENT_WEEK = 7;

const ROSTER_POSITIONS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN'];

export const sleeperState: SleeperNflState = {
  season: '2026',
  league_season: '2026',
  season_type: 'regular',
  week: MOCK_CURRENT_WEEK,
};

const commonSettings = { type: 0, best_ball: 0, leg: MOCK_CURRENT_WEEK };
const commonScoring = { rec: 0.5, pass_td: 4, rush_td: 6, rec_td: 6 };

export const sleeperLeaguesById: Record<string, SleeperLeague> = {
  'mock-sleeper-1': {
    league_id: 'mock-sleeper-1',
    name: 'Redraft Rebels',
    season: '2026',
    status: 'in_season',
    total_rosters: 2,
    roster_positions: ROSTER_POSITIONS,
    scoring_settings: commonScoring,
    settings: commonSettings,
  },
  'mock-sleeper-2': {
    league_id: 'mock-sleeper-2',
    name: 'Dynasty Dumpster Fire',
    season: '2026',
    status: 'in_season',
    total_rosters: 2,
    roster_positions: ROSTER_POSITIONS,
    scoring_settings: commonScoring,
    settings: commonSettings,
  },
};

export const sleeperLeagueUsersById: Record<string, SleeperLeagueUser[]> = {
  'mock-sleeper-1': [
    { user_id: MOCK_SLEEPER_OWNER_ID, display_name: 'Mock Sleeper Owner', metadata: { team_name: 'Redraft Rebels' } },
    { user_id: 'mock-sleeper-1-opp-owner', display_name: 'Gridiron Ghosts', metadata: null },
  ],
  'mock-sleeper-2': [
    {
      user_id: MOCK_SLEEPER_OWNER_ID,
      display_name: 'Mock Sleeper Owner',
      metadata: { team_name: 'Dynasty Dumpster Fire' },
    },
    { user_id: 'mock-sleeper-2-opp-owner', display_name: 'Keeper League Chaos', metadata: null },
  ],
};

export const sleeperRostersById: Record<string, SleeperRoster[]> = {
  'mock-sleeper-1': [
    {
      roster_id: 1,
      owner_id: MOCK_SLEEPER_OWNER_ID,
      players: [
        'p-rr-qb',
        'p-rr-rb1',
        'p-rr-rb2',
        'p-rr-wr1',
        'p-rr-wr2',
        'p-rr-te',
        'p-rr-flex',
        'p-rr-k',
        'p-rr-def',
        'p-rr-bn1',
      ],
      starters: [
        'p-rr-qb',
        'p-rr-rb1',
        'p-rr-rb2',
        'p-rr-wr1',
        'p-rr-wr2',
        'p-rr-te',
        'p-rr-flex',
        'p-rr-k',
        'p-rr-def',
      ],
      reserve: null,
      taxi: null,
      settings: { wins: 5, losses: 1, ties: 0, fpts: 812, fpts_decimal: 40, fpts_against: 701, fpts_against_decimal: 20 },
    },
    {
      roster_id: 2,
      owner_id: 'mock-sleeper-1-opp-owner',
      players: ['p-rr-opp-qb'],
      starters: ['p-rr-opp-qb'],
      reserve: null,
      taxi: null,
      settings: { wins: 3, losses: 3, ties: 0, fpts: 754, fpts_decimal: 80, fpts_against: 760, fpts_against_decimal: 10 },
    },
  ],
  'mock-sleeper-2': [
    {
      roster_id: 1,
      owner_id: MOCK_SLEEPER_OWNER_ID,
      players: [
        'p-ddf-qb',
        'p-ddf-rb1',
        'p-ddf-rb2',
        'p-ddf-wr1',
        'p-ddf-wr2',
        'p-ddf-te',
        'p-ddf-flex',
        'p-ddf-k',
        'p-ddf-def',
        'p-ddf-bn1',
      ],
      starters: [
        'p-ddf-qb',
        'p-ddf-rb1',
        'p-ddf-rb2',
        'p-ddf-wr1',
        'p-ddf-wr2',
        'p-ddf-te',
        'p-ddf-flex',
        'p-ddf-k',
        'p-ddf-def',
      ],
      reserve: null,
      taxi: null,
      settings: { wins: 2, losses: 4, ties: 0, fpts: 640, fpts_decimal: 30, fpts_against: 705, fpts_against_decimal: 90 },
    },
    {
      roster_id: 2,
      owner_id: 'mock-sleeper-2-opp-owner',
      players: ['p-ddf-opp-qb'],
      starters: ['p-ddf-opp-qb'],
      reserve: null,
      taxi: null,
      settings: { wins: 4, losses: 2, ties: 0, fpts: 698, fpts_decimal: 50, fpts_against: 655, fpts_against_decimal: 0 },
    },
  ],
};

export const sleeperMatchupsById: Record<string, SleeperMatchup[]> = {
  'mock-sleeper-1': [
    { roster_id: 1, matchup_id: 1, points: 118.6 },
    { roster_id: 2, matchup_id: 1, points: 96.2 },
  ],
  'mock-sleeper-2': [
    { roster_id: 1, matchup_id: 1, points: 74.1 },
    { roster_id: 2, matchup_id: 1, points: 103.4 },
  ],
};

export const sleeperPlayers: SleeperPlayersResponse = {
  // -- Redraft Rebels (mock-sleeper-1) --
  'p-rr-qb': { player_id: 'p-rr-qb', full_name: 'Trent Marshall', position: 'QB', team: 'BUF', bye_week: 12 },
  'p-rr-rb1': { player_id: 'p-rr-rb1', full_name: 'Deshawn Fields', position: 'RB', team: 'SF', bye_week: 9 },
  'p-rr-rb2': { player_id: 'p-rr-rb2', full_name: 'Marcus Whitlow', position: 'RB', team: 'DAL', bye_week: 10 },
  'p-rr-wr1': { player_id: 'p-rr-wr1', full_name: 'Jaylen Cross', position: 'WR', team: 'MIA', bye_week: 11 },
  'p-rr-wr2': { player_id: 'p-rr-wr2', full_name: 'Devon Sharpe', position: 'WR', team: 'CIN', bye_week: 8 },
  'p-rr-te': { player_id: 'p-rr-te', full_name: 'Coleman Vance', position: 'TE', team: 'KC', bye_week: 10 },
  'p-rr-flex': { player_id: 'p-rr-flex', full_name: 'Isaiah Brooks', position: 'WR', team: 'DET', bye_week: 9 },
  'p-rr-k': { player_id: 'p-rr-k', full_name: 'Nico Ferraro', position: 'K', team: 'BAL', bye_week: 13 },
  'p-rr-def': { player_id: 'p-rr-def', first_name: 'Jets', last_name: 'D/ST', position: 'DEF', team: 'NYJ', bye_week: 12 },
  'p-rr-bn1': { player_id: 'p-rr-bn1', full_name: 'Omar Petty', position: 'RB', team: 'ARI', bye_week: 6 },
  'p-rr-opp-qb': { player_id: 'p-rr-opp-qb', full_name: 'Grady Holt', position: 'QB', team: 'PHI', bye_week: 14 },
  // Unrostered in mock-sleeper-1 (waiver wire): higher-projected than the WR1 starter.
  'p-rr-waiver-wr': { player_id: 'p-rr-waiver-wr', full_name: 'Kellan Odom', position: 'WR', team: 'LAR', bye_week: 9 },

  // -- Dynasty Dumpster Fire (mock-sleeper-2) --
  'p-ddf-qb': { player_id: 'p-ddf-qb', full_name: 'Wyatt Cobb', position: 'QB', team: 'LAC', bye_week: 12 },
  'p-ddf-rb1': {
    player_id: 'p-ddf-rb1',
    full_name: 'Antoine Ridley',
    position: 'RB',
    team: 'MIN',
    bye_week: MOCK_CURRENT_WEEK,
  },
  'p-ddf-rb2': { player_id: 'p-ddf-rb2', full_name: 'Chase Dumont', position: 'RB', team: 'NO', bye_week: 11 },
  'p-ddf-wr1': {
    player_id: 'p-ddf-wr1',
    full_name: 'Reggie Voss',
    position: 'WR',
    team: 'SEA',
    injury_status: 'Out',
    bye_week: 9,
  },
  'p-ddf-wr2': { player_id: 'p-ddf-wr2', full_name: 'Tobias Lang', position: 'WR', team: 'HOU', bye_week: 10 },
  'p-ddf-te': { player_id: 'p-ddf-te', full_name: 'Miles Anders', position: 'TE', team: 'GB', bye_week: 6 },
  'p-ddf-flex': { player_id: 'p-ddf-flex', full_name: 'Corbin Yates', position: 'RB', team: 'CLE', bye_week: 8 },
  'p-ddf-k': { player_id: 'p-ddf-k', full_name: 'Pablo Ibarra', position: 'K', team: 'TB', bye_week: 11 },
  'p-ddf-def': { player_id: 'p-ddf-def', first_name: 'Ravens', last_name: 'D/ST', position: 'DEF', team: 'BAL', bye_week: 13 },
  'p-ddf-bn1': { player_id: 'p-ddf-bn1', full_name: 'Dexter Loomis', position: 'WR', team: 'ATL', bye_week: 7 },
  'p-ddf-opp-qb': { player_id: 'p-ddf-opp-qb', full_name: 'Silas Meyer', position: 'QB', team: 'IND', bye_week: 14 },
};

/**
 * Sparse on purpose — most players have no entry here, exercising the "skip when projection is
 * unknown" path in the bench/waiver flags. Set up so:
 *  - mock-sleeper-1: bench RB (p-rr-bn1) outprojects starting RB (p-rr-rb1) -> BENCH_PLAYER_HIGHER_PROJECTION
 *  - mock-sleeper-1: unrostered WR (p-rr-waiver-wr) outprojects starting WR (p-rr-wr1) -> WAIVER_PLAYER_HIGHER_PROJECTION
 */
export const sleeperProjections: SleeperProjectionsResponse = [
  { player_id: 'p-rr-rb1', stats: { pts_ppr: 9.5 } },
  { player_id: 'p-rr-bn1', stats: { pts_ppr: 14.2 } },
  { player_id: 'p-rr-wr1', stats: { pts_ppr: 8.0 } },
  { player_id: 'p-rr-waiver-wr', stats: { pts_ppr: 16.8 } },
];
