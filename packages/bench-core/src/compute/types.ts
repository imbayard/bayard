import type { OLineRating } from '../types/nflverse.js';

export interface BenchIqFlag {
  type:
    | 'BYE_WEEK_STARTER'
    | 'INCOMPLETE_LINEUP'
    | 'STARTING_INACTIVE'
    | 'BENCH_PLAYER_HIGHER_PROJECTION'
    | 'WAIVER_PLAYER_HIGHER_PROJECTION';
  level: 'critical' | 'warning';
  playerId: string | null;
  playerName: string | null;
  slot: string | null;
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
