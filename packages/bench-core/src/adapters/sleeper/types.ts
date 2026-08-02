/** Raw Sleeper API response shapes. Only the fields we consume. */

export interface SleeperUser {
  user_id: string;
  username: string;
  display_name: string;
  avatar: string | null;
}

export interface SleeperNflState {
  /** Current calendar season, e.g. "2025" */
  season: string;
  /** Season leagues are being played in (differs from `season` in offseason) */
  league_season?: string;
  /** 'pre' | 'regular' | 'post' | 'off' */
  season_type: string;
  week: number;
  display_week?: number;
  leg?: number;
}

export interface SleeperLeagueSettings {
  /** 0 = redraft, 1 = keeper, 2 = dynasty */
  type?: number;
  /** 1 = best ball */
  best_ball?: number;
  /** current week within the league */
  leg?: number;
  [key: string]: number | undefined;
}

export interface SleeperLeague {
  league_id: string;
  name: string;
  season: string;
  status: string;
  total_rosters: number;
  roster_positions: string[] | null;
  scoring_settings: Record<string, number> | null;
  settings: SleeperLeagueSettings;
}

export interface SleeperLeagueUser {
  user_id: string;
  display_name: string;
  metadata?: {
    team_name?: string;
  } | null;
}

export interface SleeperRosterSettings {
  wins?: number;
  losses?: number;
  ties?: number;
  fpts?: number;
  fpts_decimal?: number;
  fpts_against?: number;
  fpts_against_decimal?: number;
}

export interface SleeperRoster {
  roster_id: number;
  owner_id: string | null;
  /** Everything on the roster: starters + bench + reserve + taxi */
  players: string[] | null;
  /** Ordered by the league's roster position slots; '0' = empty slot */
  starters: string[] | null;
  /** IR */
  reserve: string[] | null;
  /** Dynasty taxi squad */
  taxi: string[] | null;
  settings: SleeperRosterSettings | null;
}

export interface SleeperMatchup {
  roster_id: number;
  /** Teams sharing a matchup_id play each other; null = bye */
  matchup_id: number | null;
  points: number | null;
  starters?: string[] | null;
  players?: string[] | null;
}

export interface SleeperPlayer {
  player_id: string;
  /** Absent for team defenses — use first_name + last_name */
  full_name?: string;
  first_name?: string;
  last_name?: string;
  position: string | null;
  team: string | null;
  injury_status?: string | null;
  bye_week?: number | null;
}

/** GET /players/nfl — object keyed by player_id */
export type SleeperPlayersResponse = Record<string, SleeperPlayer>;

export interface SleeperProjection {
  player_id: string;
  stats: {
    pts_ppr?: number;
    pts_std?: number;
    pts_half_ppr?: number;
    [key: string]: number | undefined;
  };
}

/** GET /projections/nfl/{season}/{week}?season_type=regular — flat array, one entry per projected player */
export type SleeperProjectionsResponse = SleeperProjection[];
