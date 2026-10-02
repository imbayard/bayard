import type { MetricWindow, PlayerCard } from '../../types/analytics.js';
import type { Player, Roster } from '../../types/league.js';
import type { BenchIqTrend } from '../types.js';

/**
 * Usage is the one thing that repeats week to week (target and carry share hold at r ≈ 0.6
 * year over year; efficiency doesn't), so a real move in it is worth a look. Thresholds are
 * in share points: a WR going from 22% to 15% of targets is a role change, not noise.
 * Raw values, not shrunk: shrinking the recent window toward last season would mute the very
 * role changes this exists to catch. The games floors below do the noise control.
 */
const TRENDS = [
  { key: 'target_share', label: 'target share', threshold: 0.07 },
  { key: 'carry_share', label: 'carry share', threshold: 0.12 },
  { key: 'off_snap_pct', label: 'snap share', threshold: 0.15 },
] as const;

/** Fewer games than this and the baseline is itself noise. */
const MIN_BASELINE_GAMES = 6;
const MIN_RECENT_GAMES = 2;

/**
 * Twice the noise threshold — e.g. 14 points of target share. Only these reach the ticker and
 * the email; anything between one and two thresholds is real but can wait behind a click.
 */
export const MAJOR_TREND_STRENGTH = 2;

interface Move {
  label: string;
  recent: MetricWindow;
  baseline: MetricWindow;
  /** 'this season' once the season is long enough to stand on its own; else last season. */
  baselineLabel: string;
  delta: number;
  strength: number;
}

function moveFor(card: PlayerCard, rule: (typeof TRENDS)[number]): Move | null {
  const w = card.metrics[rule.key];
  const recent = w?.last4;
  if (!w || !recent || recent.n < MIN_RECENT_GAMES) return null;
  // Early in the season the last four games *are* the season, so compare against last year.
  const [baseline, baselineLabel] =
    w.season && w.season.n >= MIN_BASELINE_GAMES
      ? [w.season, 'this season']
      : w.prior && w.prior.n >= MIN_BASELINE_GAMES
        ? [w.prior, 'last season']
        : [null, ''];
  if (!baseline) return null;
  const delta = recent.value - baseline.value;
  return { label: rule.label, recent, baseline, baselineLabel, delta, strength: Math.abs(delta) / rule.threshold };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Every starter or bench player whose usage has moved past the noise threshold, either
 * direction — one per player (the strongest move), strongest first.
 */
export function usageTrends(
  roster: Roster,
  players: Map<string, Player>,
  cards: Map<string, PlayerCard>,
): BenchIqTrend[] {
  const trends: BenchIqTrend[] = [];
  for (const entry of roster.entries) {
    if (entry.slot !== 'starter' && entry.slot !== 'bench') continue;
    const player = players.get(entry.externalPlayerId);
    const card = cards.get(entry.externalPlayerId);
    if (!player || !card) continue;

    const best = TRENDS.map((rule) => moveFor(card, rule))
      .filter((m): m is Move => m !== null && m.strength >= 1)
      .sort((a, b) => b.strength - a.strength)[0];
    if (!best) continue;

    const games = best.recent.n === 1 ? 'last game' : `last ${best.recent.n} games`;
    const where = entry.slot === 'bench' ? ' (bench)' : '';
    trends.push({
      playerId: player.externalPlayerId,
      playerName: player.fullName,
      slot: entry.slot,
      metric: best.label,
      recent: best.recent.value,
      baseline: best.baseline.value,
      baselineLabel: best.baselineLabel,
      games: best.recent.n,
      strength: best.strength,
      major: best.strength >= MAJOR_TREND_STRENGTH,
      message:
        `${player.fullName}${where}: ${best.label} ${pct(best.recent.value)} over the ${games}, ` +
        `${best.delta < 0 ? 'down' : 'up'} from ${pct(best.baseline.value)} ${best.baselineLabel}`,
    });
  }
  return trends.sort((a, b) => b.strength - a.strength);
}
