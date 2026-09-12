import type { OffenseGiveawayRating, TeamGiveawayAggregate } from '../../types/nflverse.js';
import { denseRankDesc, normalize, round1 } from '../normalize.js';

/**
 * Facet weights for the composite. Turnovers lead because they are worth the most per
 * event to a fantasy defense (the takeaway itself, plus the short field and the return
 * scores that follow); points allowed is the next biggest bucket on a standard DEF
 * scoring table; sacks are only a point apiece, but they are the steadiest of the three.
 */
const WEIGHTS = { turnovers: 0.4, scoring: 0.35, pressure: 0.25 } as const;

/** The week at which the current season stands on its own and the prior one is dropped. */
const BLEND_UNTIL_WEEK = 5;

/**
 * How heavily to weight last season's giveaway aggregate when scouting `week`.
 * Week 1 has no current-season sample at all, so it leans almost entirely on last year
 * and decays linearly to nothing by week 5.
 */
export function priorSeasonWeight(week: number): number {
  if (week <= 0) return 1;
  if (week >= BLEND_UNTIL_WEEK) return 0;
  return round1((BLEND_UNTIL_WEEK - week) / BLEND_UNTIL_WEEK);
}

/**
 * Turn per-offense giveaway counts into league-normalized 0-100 ratings, where a high
 * score means "a good offense to stream a defense against". Pure: normalization is
 * relative to the teams present in `aggregates`, so a partial league still ranks sanely.
 *
 * Zero-data guard: a team with no plays yet is treated as worst-in-league on every
 * facet (the toughest offense to face), so an empty row can never top the board on the
 * strength of having no evidence against it. When NO team has data the spread is zero
 * and `normalize` gives everyone a neutral 50.
 */
export function offenseGiveawayRatings(
  aggregates: TeamGiveawayAggregate[],
): OffenseGiveawayRating[] {
  // Raw rates; null where a team has no denominator for that facet.
  const sackRates = aggregates.map((a) => (a.dropbacks > 0 ? a.sacksAllowed / a.dropbacks : null));
  const turnoverRates = aggregates.map((a) =>
    a.plays > 0 ? (a.interceptions + a.fumblesLost) / a.plays : null,
  );
  const pointsPerGame = aggregates.map((a) => (a.games > 0 ? a.points / a.games : null));

  const extremes = (values: (number | null)[]): { min: number; max: number } => {
    const valid = values.filter((v): v is number => v !== null);
    return valid.length ? { min: Math.min(...valid), max: Math.max(...valid) } : { min: 0, max: 0 };
  };
  const sack = extremes(sackRates);
  const turnover = extremes(turnoverRates);
  const points = extremes(pointsPerGame);

  // No data -> the worst end of each facet: fewest sacks/turnovers given up, most points scored.
  const pressures = sackRates.map((r) => normalize(r ?? sack.min, sack.min, sack.max, true));
  const turnovers = turnoverRates.map((r) =>
    normalize(r ?? turnover.min, turnover.min, turnover.max, true),
  );
  const scorings = pointsPerGame.map((p) =>
    normalize(p ?? points.max, points.min, points.max, false),
  );

  const scores = aggregates.map((_, i) =>
    round1(
      WEIGHTS.turnovers * (turnovers[i] as number) +
        WEIGHTS.scoring * (scorings[i] as number) +
        WEIGHTS.pressure * (pressures[i] as number),
    ),
  );
  const ranks = denseRankDesc(scores);

  return aggregates.map((aggregate, i) => ({
    team: aggregate.team,
    score: scores[i] as number,
    rank: ranks[i] as number,
    pressure: pressures[i] as number,
    turnovers: turnovers[i] as number,
    scoring: scorings[i] as number,
    // Blending fractional prior-season games can land on 12.6 — round for display.
    games: round1(aggregate.games),
  }));
}
