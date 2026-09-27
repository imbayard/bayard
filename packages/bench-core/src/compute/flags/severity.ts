import type { BenchIqFlag } from '../types.js';

/**
 * Urgency order, lowest first. `level` already separates critical from warning, but three
 * types share `'critical'` and their order within that tier is a real judgement: an unfilled
 * slot scores nothing at all, an inactive starter almost nothing, a bye-week starter exactly
 * nothing but you knew weeks ago. Shared so the attention queue and the email agree.
 */
export const FLAG_TYPE_RANK: Record<BenchIqFlag['type'], number> = {
  INCOMPLETE_LINEUP: 0,
  STARTING_INACTIVE: 1,
  BYE_WEEK_STARTER: 2,
  BENCH_PLAYER_HIGHER_PROJECTION: 3,
  WAIVER_PLAYER_HIGHER_PROJECTION: 4,
  // Last: weather is context for a decision, not a better player sitting on your bench.
  WEATHER_RISK: 5,
};

export function compareFlagTypes(a: BenchIqFlag['type'], b: BenchIqFlag['type']): number {
  return FLAG_TYPE_RANK[a] - FLAG_TYPE_RANK[b];
}
