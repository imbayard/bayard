/** A metric's value over one window of games. */
export interface MetricWindow {
  /** The raw number over the window's games. Trend flags compare these. */
  value: number;
  /**
   * The value shrunk toward what the player's history predicts, in proportion to how few
   * games are in the window (calibrated per metric). What a card should show. Null until the
   * metric is calibrated.
   */
  shrunk: number | null;
  /** Games in the window. */
  n: number;
  /** Percentile of the shrunk value within the position group; null below the window's sample floor. */
  pct: number | null;
}

/**
 * The windows the pipeline keeps: this week's game, the last four games played, season to
 * date, and the whole of last season. A window is absent when the player has no games in it.
 */
export type MetricWindows = Partial<Record<'week' | 'last4' | 'season' | 'prior', MetricWindow>>;

/** One player's analytics card, keyed by metric (e.g. `target_share`, `off_snap_pct`). */
export interface PlayerCard {
  /** The pipeline's own player ID: the same NFL player whichever platform asked. */
  pid: number;
  name: string;
  position: string | null;
  /** QB RB WR TE OL DL LB DB K P LS */
  posGroup: string | null;
  metrics: Record<string, MetricWindows>;
}

export interface PlayerCards {
  season: number | null;
  /** The latest week the pipeline has closed; null when the season has no games yet. */
  week: number | null;
  /** When the pipeline last rebuilt; null if it never has. */
  asOf: string | null;
  /** Keyed by the platform player ID the caller asked with. Unknown IDs are absent. */
  players: Map<string, PlayerCard>;
}
