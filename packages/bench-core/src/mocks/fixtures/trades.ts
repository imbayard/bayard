/**
 * "Trade Winds": a four-team league with full rosters, built for Trade Radar in mock mode
 * (the other mock leagues give opponents a single player). Merged into the Sleeper fixtures
 * by `MockSleeperClient`; the FantasyCalc rows feed `MockFantasyCalcClient`.
 *
 * Shaped for a clear read: my team is deep at WR and thin at RB, Squall Line the reverse.
 */
import type { FantasyCalcValuesResponse } from '../../adapters/fantasycalc/types.js';
import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperPlayersResponse,
  SleeperRoster,
  SleeperSeasonStatsResponse,
} from '../../adapters/sleeper/types.js';

export const TRADE_LEAGUE_ID = 'mock-sleeper-trades';
const OWNER = 'mock-sleeper-owner';

/** [id, name, position, team, ppg, games, last season ppg, market value, age] */
type Row = [string, string, string, string, number, number, number, number, number];

const TEAMS: Array<{ owner: string; name: string; record: [number, number]; rows: Row[] }> = [
  {
    owner: OWNER,
    name: 'Trade Winds',
    record: [5, 2],
    rows: [
      ['tw-qb', 'Ricky Calloway', 'QB', 'CIN', 21.4, 7, 19.8, 5600, 28],
      ['tw-rb1', 'Lamar Okafor', 'RB', 'ATL', 13.9, 7, 14.6, 4700, 25],
      ['tw-rb2', 'Bryce Talley', 'RB', 'NE', 7.1, 6, 8.4, 900, 29],
      ['tw-wr1', 'Dante Rhodes', 'WR', 'MIN', 18.8, 7, 17.2, 7400, 25],
      ['tw-wr2', 'Corey Ashby', 'WR', 'HOU', 16.6, 7, 15.1, 6100, 26],
      ['tw-wr3', 'Malik Fenn', 'WR', 'LAC', 15.2, 7, 12.9, 5400, 24],
      ['tw-wr4', 'Tre Halvorsen', 'WR', 'GB', 13.8, 7, 14.4, 4600, 27],
      ['tw-te', 'Wes Pruitt', 'TE', 'IND', 9.6, 7, 10.2, 2900, 28],
    ],
  },
  {
    owner: 'mock-trades-squall',
    name: 'Squall Line',
    record: [4, 3],
    rows: [
      ['sl-qb', 'Jordan Pike', 'QB', 'HOU', 19.2, 7, 20.4, 4900, 29],
      ['sl-rb1', 'Xavier Mott', 'RB', 'DET', 19.6, 7, 18.1, 8200, 24],
      ['sl-rb2', 'Cal Benning', 'RB', 'PIT', 16.9, 7, 13.0, 6400, 25],
      ['sl-rb3', 'Rashad Coyle', 'RB', 'TB', 14.7, 7, 15.9, 5300, 26],
      ['sl-wr1', 'Owen Strickland', 'WR', 'SEA', 12.1, 7, 13.5, 3600, 29],
      ['sl-wr2', 'Tyrese Lamb', 'WR', 'NO', 7.4, 5, 9.0, 1000, 30],
      ['sl-te', 'Gus Hadley', 'TE', 'NYG', 8.8, 7, 9.9, 2600, 27],
    ],
  },
  {
    owner: 'mock-trades-gale',
    name: 'Gale Force',
    record: [3, 4],
    rows: [
      ['gf-qb', 'Mason Reyes', 'QB', 'LV', 17.8, 7, 18.9, 4300, 31],
      ['gf-rb1', 'Andre Voss', 'RB', 'CHI', 12.8, 7, 12.1, 3900, 26],
      ['gf-rb2', 'Eli Grant', 'RB', 'TEN', 10.9, 7, 11.6, 2900, 27],
      ['gf-wr1', 'Nate Corbin', 'WR', 'JAX', 15.4, 7, 14.8, 5100, 26],
      ['gf-wr2', 'Paxton Doyle', 'WR', 'CAR', 12.7, 7, 13.1, 3900, 27],
      ['gf-te', 'Hollis Kerr', 'TE', 'DEN', 11.3, 7, 8.7, 3600, 25],
    ],
  },
  {
    owner: 'mock-trades-doldrums',
    name: 'Doldrums',
    record: [2, 5],
    rows: [
      ['dd-qb', 'Ty Brannigan', 'QB', 'NYJ', 15.1, 7, 17.0, 3000, 34],
      ['dd-rb1', 'Ken Albright', 'RB', 'WAS', 10.2, 7, 11.9, 2400, 29],
      ['dd-rb2', 'Luis Ortega', 'RB', 'ARI', 9.1, 6, 10.4, 2000, 30],
      ['dd-wr1', 'Silas Wade', 'WR', 'BAL', 11.2, 7, 12.6, 3100, 30],
      ['dd-wr2', 'Rory Fitch', 'WR', 'PHI', 9.8, 7, 11.0, 2400, 31],
      ['dd-te', 'Abe Lindqvist', 'TE', 'SF', 6.9, 7, 8.1, 1400, 31],
    ],
  },
];

/** On nobody's roster: the waiver wire, which sets replacement level. */
const WAIVERS: Row[] = [
  ['tw-fa-qb', 'Colt Harmon', 'QB', 'CLE', 12.3, 6, 13.0, 500, 30],
  ['tw-fa-rb', 'Deon Kirby', 'RB', 'MIA', 5.8, 5, 6.2, 300, 27],
  ['tw-fa-wr', 'Jace Wilder', 'WR', 'DAL', 6.4, 7, 5.1, 350, 25],
  ['tw-fa-te', 'Ford Abernathy', 'TE', 'KC', 4.6, 6, 5.0, 200, 29],
];

const ALL = [...TEAMS.flatMap((t) => t.rows), ...WAIVERS];

export const tradeLeague: SleeperLeague = {
  league_id: TRADE_LEAGUE_ID,
  name: 'Trade Winds',
  season: '2026',
  status: 'in_season',
  total_rosters: TEAMS.length,
  roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF', 'BN', 'BN', 'BN', 'BN'],
  scoring_settings: { rec: 0.5, pass_td: 4, rush_td: 6, rec_td: 6 },
  settings: { type: 0, best_ball: 0, leg: 7 },
};

export const tradeLeagueUsers: SleeperLeagueUser[] = TEAMS.map((t) => ({
  user_id: t.owner,
  display_name: t.owner === OWNER ? 'Mock Sleeper Owner' : t.name,
  metadata: { team_name: t.name },
}));

export const tradeRosters: SleeperRoster[] = TEAMS.map((t, i) => ({
  roster_id: i + 1,
  owner_id: t.owner,
  players: t.rows.map(([id]) => id),
  starters: t.rows.slice(0, 7).map(([id]) => id),
  reserve: null,
  taxi: null,
  settings: {
    wins: t.record[0],
    losses: t.record[1],
    ties: 0,
    fpts: 700 + 20 * t.record[0],
    fpts_decimal: 0,
    fpts_against: 720,
    fpts_against_decimal: 0,
  },
}));

export const tradePlayers: SleeperPlayersResponse = Object.fromEntries(
  ALL.map(([id, name, position, team]) => [id, { player_id: id, full_name: name, position, team, bye_week: 10 }]),
);

/** Standard-scored season lines with no catches, so the half-PPR re-score lands on `ppg` exactly. */
const seasonLine = (ppg: number, gp: number) => ({ gp, pts_std: ppg * gp, pts_ppr: ppg * gp, rec: 0 });

export const tradeSeasonStats: SleeperSeasonStatsResponse = Object.fromEntries(
  ALL.map(([id, , , , ppg, gp]) => [id, seasonLine(ppg, gp)]),
);

export const tradePriorSeasonStats: SleeperSeasonStatsResponse = Object.fromEntries(
  ALL.map(([id, , , , , , prior]) => [id, seasonLine(prior, 17)]),
);

export const fantasyCalcValues: FantasyCalcValuesResponse = ALL.map(([id, name, position, , , , , value, age]) => ({
  player: { name, position, sleeperId: id, espnId: null, maybeAge: age },
  value,
  redraftValue: value,
  trend30Day: 0,
}));
