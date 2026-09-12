import type { OLineRating, TeamOLineAggregate } from '../../types/nflverse.js';
import { denseRankDesc, normalize } from '../normalize.js';
import type { BenchIqInsight } from '../types.js';

/**
 * Turn per-team season-to-date blocking counts into league-normalized O-Line
 * ratings. Pure: normalization is relative to the teams present in `aggregates`.
 *
 * Zero-data guard: a team with 0 dropbacks (no pass metric) or 0 rushAttempts
 * (no run metric) is treated as worst-in-league for that facet — its effective
 * sack rate is the league max and its effective mean rush EPA is the league
 * min, so it scores 0 and ranks last. When NO team has data for a facet, the
 * spread is zero and the divide-by-zero guard gives everyone 50.
 */
export function oLineRatings(aggregates: TeamOLineAggregate[]): OLineRating[] {
  // Raw metrics; null where a team has no data for that facet.
  const sackRates = aggregates.map((a) => (a.dropbacks > 0 ? a.sacks / a.dropbacks : null));
  const meanEpas = aggregates.map((a) => (a.rushAttempts > 0 ? a.rushEpaSum / a.rushAttempts : null));

  const validSackRates = sackRates.filter((r): r is number => r !== null);
  const validMeanEpas = meanEpas.filter((e): e is number => e !== null);

  // League extremes over teams that actually have data.
  const minSackRate = validSackRates.length ? Math.min(...validSackRates) : 0;
  const maxSackRate = validSackRates.length ? Math.max(...validSackRates) : 0;
  const minEpa = validMeanEpas.length ? Math.min(...validMeanEpas) : 0;
  const maxEpa = validMeanEpas.length ? Math.max(...validMeanEpas) : 0;

  const passBlocks = sackRates.map((rate) =>
    // No pass data → worst-in-league sack rate (max), i.e. score 0.
    normalize(rate ?? maxSackRate, minSackRate, maxSackRate, false),
  );
  const runBlocks = meanEpas.map((epa) =>
    // No run data → worst-in-league mean EPA (min), i.e. score 0.
    normalize(epa ?? minEpa, minEpa, maxEpa, true),
  );

  const passRanks = denseRankDesc(passBlocks);
  const runRanks = denseRankDesc(runBlocks);

  return aggregates.map((aggregate, i) => ({
    team: aggregate.team,
    passBlock: passBlocks[i] as number,
    runBlock: runBlocks[i] as number,
    passRank: passRanks[i] as number,
    runRank: runRanks[i] as number,
  }));
}

/** Wrap each {@link OLineRating} as a neutral team-scoped insight. */
export function oLineInsights(aggregates: TeamOLineAggregate[]): BenchIqInsight[] {
  return oLineRatings(aggregates).map((rating) => ({
    type: 'OLINE_RATING',
    scope: 'team',
    team: rating.team,
    data: rating,
  }));
}
