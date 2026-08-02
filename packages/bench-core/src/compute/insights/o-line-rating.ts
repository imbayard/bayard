import type { OLineRating, TeamOLineAggregate } from '../../types/nflverse.js';
import type { BenchIqInsight } from '../types.js';

/** Round to a single decimal place. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Dense ranking of scores, 1 = highest. Ties share the lower rank number
 * (e.g. two teams tied for best both get rank 1, the next distinct score is 2).
 */
function denseRankDesc(scores: number[]): number[] {
  const distinctDesc = [...new Set(scores)].sort((a, b) => b - a);
  const rankOf = new Map<number, number>();
  distinctDesc.forEach((score, i) => rankOf.set(score, i + 1));
  return scores.map((score) => rankOf.get(score) as number);
}

/**
 * Min-max normalize a raw metric to 0-100 where `best` maps to 100.
 * When every team shares the same metric (max === min) the spread is zero, so
 * normalization is undefined — we return 50 (neutral) for everyone.
 */
function normalize(value: number, min: number, max: number, higherIsBetter: boolean): number {
  // Divide-by-zero guard: no spread across the league → neutral 50.
  if (max === min) return 50;
  const scaled = higherIsBetter ? (value - min) / (max - min) : (max - value) / (max - min);
  return round1(100 * scaled);
}

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
