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
