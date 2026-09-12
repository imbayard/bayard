/** Raw nflverse play-by-play row shapes. Only the subset of columns we parse. */

/**
 * A single parsed play-by-play row. nflverse CSVs carry hundreds of columns;
 * we type only the handful the O-Line aggregate needs. All values arrive as
 * strings straight from the CSV (numeric flags are '0'/'1', missing = '' or 'NA').
 * The index signature keeps the remaining columns accessible without typing them.
 */
export interface RawPbpRow {
  /** Offensive team abbreviation (nflverse spelling — normalize before use). */
  posteam?: string;
  /** 'pass' | 'run' | 'punt' | ... */
  play_type?: string;
  /** '1' when the play was a sack. */
  sack?: string;
  /** '1' on QB dropbacks. May be absent on older seasons — see mapper derivation. */
  qb_dropback?: string;
  /** '1' when the QB scrambled. */
  qb_scramble?: string;
  /** '1' on pass attempts (excludes sacks). */
  pass_attempt?: string;
  /** '1' on rush plays. */
  rush_attempt?: string;
  /** Expected points added for the play; '' or 'NA' when not charted. */
  epa?: string;
  /** Season year. */
  season?: string;
  /** Week number. */
  week?: string;
  [column: string]: string | undefined;
}

/**
 * A single parsed row of the nflverse team weekly stats asset — one row per team per
 * game, holding that team's whole stat line. Only the columns the giveaway aggregate
 * reads are typed; the index signature keeps the other ~130 accessible.
 *
 * Note the row carries the team's *own* offense and defense both. The giveaway
 * aggregate only reads the offensive side: what this team hands to whoever it plays.
 */
export interface RawTeamWeekRow {
  season?: string;
  week?: string;
  /** 'REG' | 'POST' | 'PRE' — the aggregate keeps regular season only. */
  season_type?: string;
  /** Team abbreviation, nflverse spelling — normalize before use. */
  team?: string;
  opponent_team?: string;
  /** Pass attempts, sacks excluded. */
  attempts?: string;
  carries?: string;
  sacks_suffered?: string;
  passing_interceptions?: string;
  /** Fumbles lost across every phase (sack, rush, reception). */
  fumbles_lost_total?: string;
  passing_tds?: string;
  rushing_tds?: string;
  passing_2pt_conversions?: string;
  rushing_2pt_conversions?: string;
  fg_made?: string;
  pat_made?: string;
  [column: string]: string | undefined;
}
