/**
 * Contract types for the nflverse-sourced O-Line rating pipeline.
 *
 * The adapter (`adapters/nflverse`) produces per-team {@link TeamOLineAggregate}
 * rows from play-by-play data; the compute layer (`compute/insights`) turns
 * those into league-normalized {@link OLineRating}s. Kept in a neutral location
 * so the adapter never imports from compute and vice versa.
 */

/**
 * Raw per-team blocking counts aggregated from a season of play-by-play.
 * All counts are season-to-date for the offensive team (`posteam`).
 */
export interface TeamOLineAggregate {
  /** Normalized NFL team code (matches `Player.nflTeam`). */
  team: string;
  /** Total dropbacks (pass attempts + sacks + scrambles). */
  dropbacks: number;
  /** Sacks allowed. */
  sacks: number;
  /** Rushing attempts by the offense. */
  rushAttempts: number;
  /** Sum of EPA across those rushing attempts (divide by rushAttempts for mean). */
  rushEpaSum: number;
}

/**
 * League-normalized O-Line strength for one team.
 * Pass block derives from sack rate (lower is better, inverted);
 * run block derives from mean rush EPA per attempt. Both scaled 0-100
 * across the 32 teams, with 1 = best rank.
 */
export interface OLineRating {
  /** Normalized NFL team code (matches `Player.nflTeam`). */
  team: string;
  /** 0-100 league-normalized pass-protection score (100 = best). */
  passBlock: number;
  /** 0-100 league-normalized run-blocking score (100 = best). */
  runBlock: number;
  /** 1-32 rank in pass protection (1 = best). */
  passRank: number;
  /** 1-32 rank in run blocking (1 = best). */
  runRank: number;
}

/**
 * Per-offense season-to-date counts of what a team hands to the defense across from it:
 * sacks taken, giveaways, and points put on the board. A fantasy DEF's output is mostly a
 * function of its opponent, so this is the raw material the matchup scout ranks DEFs on.
 *
 * Offense-only by design: `points` counts what this team's offense scored, so a defensive
 * or special-teams touchdown doesn't make its offense look harder to play.
 */
export interface TeamGiveawayAggregate {
  /** Normalized NFL team code (matches `Player.nflTeam`). */
  team: string;
  /** Games counted — the per-game denominators. */
  games: number;
  /** Pass attempts + sacks taken. */
  dropbacks: number;
  /** Pass attempts + carries + sacks taken. */
  plays: number;
  sacksAllowed: number;
  interceptions: number;
  fumblesLost: number;
  /** Points scored by this team's offense. */
  points: number;
}

/**
 * League-normalized "how good is it to stream a defense against this team", 0-100 with
 * 1 = the single best offense to face. Composed of three facets, each normalized across
 * the teams present and then weighted (see `compute/scout/offense-giveaway.ts`).
 */
export interface OffenseGiveawayRating {
  /** Normalized NFL team code — the offense being faced. */
  team: string;
  /** 0-100 composite (100 = the softest offense to play a defense against). */
  score: number;
  /** 1-32 rank on `score` (1 = softest). */
  rank: number;
  /** 0-100 facet: sacks this offense allows per dropback. */
  pressure: number;
  /** 0-100 facet: interceptions + fumbles lost per play. */
  turnovers: number;
  /** 0-100 facet: offensive points per game, inverted (fewer = better to face). */
  scoring: number;
  /** Games behind the numbers — small samples early in a season. */
  games: number;
}
