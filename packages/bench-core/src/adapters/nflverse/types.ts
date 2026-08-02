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
