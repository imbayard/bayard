import type { MarketFormat } from '../../adapters/fantasycalc/client.js';
import type { MetricCalibration } from '../../types/analytics.js';
import type { League } from '../../types/league.js';
import type { SeasonProduction } from '../../types/platform.js';

export const TRADE_POSITIONS = ['QB', 'RB', 'WR', 'TE'];

/** The pipeline's ppr_pg calibration on 2016–2025, for when analytics can't be reached. */
export const FALLBACK_CALIBRATION: MetricCalibration = { yoyR: 0.783, shrinkK: 1.144 };

/** Matches the pipeline (metrics/__init__.py): seasons shorter than this don't set a prior. */
const MIN_PRIOR_GAMES = 6;
const R_MAX = 0.9;

/**
 * Season PPG shrunk toward what last season predicts, the same way the analytics pipeline
 * shrinks its own metrics: μ = m + r·(last − m), where m is the position's mean last season,
 * then (n·x + k·μ) / (n + k). Knowing last season tightens the prior, so k grows by
 * 1 / (1 − r²). Done here rather than in the pipeline because the PPG is the league's own
 * scoring; only r and k come from analytics. Keyed like `production`.
 */
export function shrinkPpg(
  production: Map<string, SeasonProduction>,
  positionOf: (id: string) => string | undefined,
  ids: Iterable<string>,
  { yoyR: r, shrinkK: k }: MetricCalibration,
): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const [id, p] of production) {
    const position = positionOf(id);
    if (!position || p.priorPpg === null || p.priorGames < MIN_PRIOR_GAMES) continue;
    const s = sums.get(position) ?? { total: 0, count: 0 };
    s.total += p.priorPpg;
    s.count += 1;
    sums.set(position, s);
  }

  const shrunk = new Map<string, number>();
  for (const id of ids) {
    const position = positionOf(id);
    const s = position ? sums.get(position) : undefined;
    const m = s && s.count > 0 ? s.total / s.count : 0;
    const p = production.get(id);
    const hasPrior = p && p.priorPpg !== null && p.priorGames >= MIN_PRIOR_GAMES;
    const mu = hasPrior ? m + r * (p.priorPpg! - m) : m;
    const kOwn = hasPrior ? k / (1 - Math.min(Math.max(r, 0), R_MAX) ** 2) : k;
    const n = p?.games ?? 0;
    shrunk.set(id, (n * (p?.ppg ?? 0) + kOwn * mu) / (n + kOwn));
  }
  return shrunk;
}

/**
 * Crude dynasty age curve: how much of a player's production you keep owning him for the
 * next few seasons. Hand-set from common aging norms (RBs fall off first, QBs last) — Player
 * Search's measured curves on 2016–25 replace it when they exist.
 */
const AGE_CURVE: Record<string, Array<[maxAge: number, multiplier: number]>> = {
  RB: [[23, 1.2], [24, 1.15], [25, 1.05], [26, 1], [27, 0.85], [28, 0.7], [Infinity, 0.55]],
  WR: [[24, 1.15], [26, 1.1], [27, 1], [28, 0.9], [29, 0.8], [Infinity, 0.65]],
  TE: [[25, 1.15], [27, 1.1], [28, 1], [29, 0.9], [30, 0.8], [Infinity, 0.65]],
  QB: [[28, 1.1], [32, 1], [35, 0.85], [Infinity, 0.65]],
};

export function ageMultiplier(position: string, age: number | null): number {
  if (age === null) return 1;
  const curve = AGE_CURVE[position];
  return curve?.find(([max]) => Math.floor(age) <= max)?.[1] ?? 1;
}

/** Points the league gives per reception, whichever platform's stat keys it uses. */
function receptionPoints(league: League): number {
  return league.scoringFormat[league.platform === 'espn' ? '53' : 'rec'] ?? 0;
}

const SUPERFLEX_SLOTS = new Set(['SUPER_FLEX', 'OP', 'QB/RB/WR/TE']);

/** The FantasyCalc market that prices this league: format, QB count, size, PPR. */
export function marketFormat(league: League): MarketFormat {
  const qbSlots = league.rosterSlots.filter((s) => s === 'QB' || SUPERFLEX_SLOTS.has(s)).length;
  const ppr = receptionPoints(league);
  return {
    isDynasty: league.leagueType === 'dynasty',
    numQbs: qbSlots >= 2 ? 2 : 1,
    numTeams: league.teamCount,
    ppr: ppr >= 0.75 ? 1 : ppr >= 0.25 ? 0.5 : 0,
  };
}
