/**
 * Shared 0-100 normalization + ranking used by the compute layer's league-relative
 * ratings (O-Line strength, matchup scout). Everything here is relative to the teams
 * handed in, never to a hardcoded league-wide constant.
 */

/** Round to a single decimal place. */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Dense ranking of scores, 1 = highest. Ties share the lower rank number
 * (e.g. two teams tied for best both get rank 1, the next distinct score is 2).
 */
export function denseRankDesc(scores: number[]): number[] {
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
export function normalize(
  value: number,
  min: number,
  max: number,
  higherIsBetter: boolean,
): number {
  // Divide-by-zero guard: no spread across the league → neutral 50.
  if (max === min) return 50;
  const scaled = higherIsBetter ? (value - min) / (max - min) : (max - value) / (max - min);
  return round1(100 * scaled);
}
