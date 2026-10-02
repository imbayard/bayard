import type { OLineRating } from '../types/nflverse.js';

export interface BenchIqFlag {
  type:
    | 'BYE_WEEK_STARTER'
    | 'INCOMPLETE_LINEUP'
    | 'STARTING_INACTIVE'
    | 'BENCH_PLAYER_HIGHER_PROJECTION'
    | 'WAIVER_PLAYER_HIGHER_PROJECTION'
    | 'WEATHER_RISK';
  level: 'critical' | 'warning';
  playerId: string | null;
  playerName: string | null;
  slot: string | null;
  message: string;
  /**
   * Projection edge in fantasy points (candidate - starter) for the projection-based
   * flags, so consumers can rank and threshold instead of treating every flag alike.
   * Null on flags that aren't a comparison (bye week, inactive, unfilled slot, weather).
   */
  delta: number | null;
  /** The starter the candidate is measured against; null on non-comparison flags. */
  starterName: string | null;
}

/**
 * A move in a rostered player's usage — a heads-up, not a lineup call. Deliberately not a
 * {@link BenchIqFlag}: trends never count toward a league's flags or its health, and the deck
 * shows them on their own ticker instead of in the attention queue.
 */
export interface BenchIqTrend {
  playerId: string;
  playerName: string;
  slot: 'starter' | 'bench';
  /** Human label, e.g. "target share". */
  metric: string;
  /** Shares as 0–1 fractions. */
  recent: number;
  baseline: number;
  /** "this season" or "last season" — what `baseline` was measured over. */
  baselineLabel: string;
  /** Games in the recent window. */
  games: number;
  /** |move| in noise thresholds, so moves in different metrics compare. */
  strength: number;
  /** Big enough for the ticker and the email; the rest wait behind a click. */
  major: boolean;
  message: string;
}

/**
 * A neutral, non-actionable observation (no urgency / `level`). Unlike a
 * {@link BenchIqFlag}, an insight just describes something ("how good this
 * team's O-Line is") and leaves any judgement to the reader.
 */
export interface BenchIqInsight {
  type: 'OLINE_RATING'; // union, extend later
  scope: 'team'; // team-level for now
  team: string; // normalized NFL team code
  data: OLineRating; // for OLINE_RATING: the OLineRating fields
}
