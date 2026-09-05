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

export interface SleeperDraftSettings {
  teams?: number;
  rounds?: number;
  pick_timer?: number;
  /** Starter/bench slot counts, e.g. slots_qb, slots_rb, slots_bn */
  [key: string]: number | undefined;
}

/**
 * GET /league/{league_id}/drafts (array, most recent first),
 * GET /user/{user_id}/drafts/nfl/{season} (array),
 * GET /draft/{draft_id} (single).
 *
 * `draft_order` and `slot_to_roster_id` are only populated once the draft order is
 * set — they are null on both the league/user list endpoints and on a pre-order draft.
 */
export interface SleeperDraft {
  draft_id: string;
  /** Null for standalone mock drafts, which belong to no league. */
  league_id?: string | null;
  /** 'pre_draft' | 'drafting' | 'paused' | 'complete' */
  status: string;
  /** 'snake' | 'linear' | 'auction' */
  type?: string;
  season?: string;
  sport?: string;
  settings?: SleeperDraftSettings | null;
  /** Epoch ms; null if the draft hasn't been scheduled yet. */
  start_time: number | null;
  /** Epoch ms of the most recent pick; null before the draft starts. */
  last_picked?: number | null;
  /** user_id -> draft slot (1-based). Null until the order is set. */
  draft_order?: Record<string, number> | null;
  /** Draft slot (as a string) -> roster_id. Null until the order is set. */
  slot_to_roster_id?: Record<string, number> | null;
  metadata?: {
    name?: string;
    description?: string;
    scoring_type?: string;
  } | null;
}

/** Denormalized player fields Sleeper stamps onto each pick. */
export interface SleeperDraftPickMetadata {
  player_id?: string;
  first_name?: string;
  last_name?: string;
  position?: string;
  team?: string;
  number?: string;
  /** Roster status, e.g. 'Active' | 'Injured Reserve' */
  status?: string;
  /** '' when healthy */
  injury_status?: string;
  /** Auction drafts only — winning bid, as a string. */
  amount?: string;
}

/** GET /draft/{draft_id}/picks — one entry per pick already made, ascending by pick_no. */
export interface SleeperDraftPick {
  draft_id: string;
  player_id: string;
  /** 1-based, across the whole draft */
  pick_no: number;
  round: number;
  /** 1-based column in the draft board */
  draft_slot: number;
  /** Sleeper user_id of the drafter; '' or null for autopick/commissioner picks. */
  picked_by: string | null;
  /** Null in standalone mock drafts (no rosters exist). Documented as a string, returned as a number. */
  roster_id: number | string | null;
  is_keeper: boolean | null;
  metadata?: SleeperDraftPickMetadata | null;
}

/** GET /draft/{draft_id}/traded_picks */
export interface SleeperTradedPick {
  season: string;
  round: number;
  /** Roster the pick originally belonged to */
  roster_id: number;
  previous_owner_id: number;
  /** Roster that currently holds the pick */
  owner_id: number;
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
