
import { alertKey, useHiddenAlerts } from './hidden-alerts';
import { useLeagues, useLeagueSummaries, type LeagueSummary } from './queries';

// --- Stress score tunables (placeholder ranges — will get more complex later) ---
const W_SEASON = 0.6;
const W_WEEK = 0.4;
// Sub-range bounds [lo, hi] within each band. Bands never hit 0 or 100 by design.
const RED_DARK = [1, 12] as const; // >1 critical per league
const RED_LIGHT = [13, 25] as const; // ≤1 critical per league
const ORANGE_RED = [26, 50] as const; // >1 warning per league
const ORANGE_YELLOW = [51, 75] as const; // ≤1 warning per league
const GREEN_MIN = 76;
const GREEN_MAX = 99;

/** Deterministic fractional value in [0,1) from an integer seed — stable across renders. */
function seededUnit(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function pickInRange([lo, hi]: readonly [number, number], seed: number): number {
  return lo + seededUnit(seed) * (hi - lo);
}

/**
 * "How stressed should I be about my portfolio right now" as a 1–99 score.
 * Red (criticals) < Orange (warnings) < Green (clean). Position within red/orange
 * is a stable placeholder pick; green depth is driven by a season/week win blend.
 */
function computeStressScore(args: {
  criticalFlags: number;
  warningFlags: number;
  leagueCount: number;
  health: number;
}): number {
  const { criticalFlags, warningFlags, leagueCount, health } = args;
  const seed = criticalFlags * 7 + warningFlags * 13 + leagueCount;
  const critRatio = leagueCount > 0 ? criticalFlags / leagueCount : criticalFlags;
  const warnRatio = leagueCount > 0 ? warningFlags / leagueCount : warningFlags;

  if (criticalFlags > 0) {
    return pickInRange(critRatio > 1 ? RED_DARK : RED_LIGHT, seed);
  }
  if (warningFlags > 0) {
    return pickInRange(warnRatio > 1 ? ORANGE_RED : ORANGE_YELLOW, seed);
  }
  return GREEN_MIN + health * (GREEN_MAX - GREEN_MIN);
}

/** Maps a 1–99 stress score to an hsl() color across the red → orange → green gradient. */
export function scoreToColor(score: number): string {
  if (score <= 25) {
    const t = (score - 1) / 24; // 0..1
    const l = 28 + t * 20; // darker red (low) → lighter red (high)
    return `hsl(0 75% ${l}%)`;
  }
  if (score <= 75) {
    const t = (score - 26) / 49; // 0..1
    const hue = 15 + t * 55; // red-orange → greenish-yellow
    return `hsl(${hue} 85% 50%)`;
  }
  const t = (score - 76) / 23; // 0..1
  const l = 45 - t * 17; // lighter green (low) → darker green (high)
  return `hsl(130 55% ${l}%)`;
}

/** Reduces per-league summaries into the single 1–99 portfolio health score. */
export function computePortfolioHealth(summaries: LeagueSummary[], hidden: Set<string>): number {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let teamsCounted = 0;
  for (const s of summaries) {
    if (!s.myTeam) continue;
    wins += s.myTeam.wins;
    losses += s.myTeam.losses;
    ties += s.myTeam.ties;
    teamsCounted += 1;
  }

  const totalGames = wins + losses + ties;
  const withMatchup = summaries.filter((s) => s.myMatchup && s.opponentMatchup);
  const winningNow = withMatchup.filter(
    (s) => (s.myMatchup?.points ?? 0) > (s.opponentMatchup?.points ?? 0),
  ).length;

  const criticalFlags = summaries.reduce(
    (n, s) => n + (s.benchIq?.flags.filter((f) => f.level === 'critical').length ?? 0),
    0,
  );
  const warningFlags = summaries.reduce(
    (n, s) =>
      n +
      (s.benchIq?.flags.filter((f) => f.level === 'warning' && !hidden.has(alertKey(s.league, f)))
        .length ?? 0),
    0,
  );

  // Green-band depth: blend of season record and how we're doing live this week.
  const seasonWin = totalGames > 0 ? wins / totalGames : 0.5;
  const weekWin = withMatchup.length > 0 ? winningNow / withMatchup.length : seasonWin;
  const health = W_SEASON * seasonWin + W_WEEK * weekWin;

  return computeStressScore({ criticalFlags, warningFlags, leagueCount: teamsCounted, health });
}

/** Portfolio health score + its gradient color, or nulls while data is loading. */
export function usePortfolioHealth(): {
  score: number | null;
  color: string | null;
  isLoading: boolean;
} {
  const { data, isPending } = useLeagues();
  const leagues = data?.leagues ?? [];
  const summaries = useLeagueSummaries(leagues);
  const { hidden } = useHiddenAlerts();
  const isLoading = isPending || summaries.some((s) => s.isLoading);

  if (isLoading || leagues.length === 0) {
    return { score: null, color: null, isLoading };
  }
  const score = computePortfolioHealth(summaries, hidden);
  return { score, color: scoreToColor(score), isLoading: false };
}
