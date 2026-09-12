import type { Player, Roster } from '../../types/league.js';
import { eligiblePositionsForSlot } from '../../types/roster-slots.js';
import type { BenchIqFlag } from '../types.js';
import { MIN_BENCH_UPGRADE_DELTA, bestFlagPerPlayer } from './upgrades.js';

/**
 * Flags the single best-projected bench player eligible for each starter slot, when it beats the
 * starter by at least `MIN_BENCH_UPGRADE_DELTA` — one flag per slot, not per bench player, and
 * then one flag per player, so a single upgrade never shows up as several suggestions.
 */
export function benchHigherProjectionFlags(roster: Roster, players: Map<string, Player>): BenchIqFlag[] {
  const flags: BenchIqFlag[] = [];
  const benchPlayers = roster.entries
    .filter((entry) => entry.slot === 'bench')
    .map((entry) => players.get(entry.externalPlayerId))
    .filter((p): p is Player => Boolean(p));

  for (const entry of roster.entries) {
    if (entry.slot !== 'starter' || !entry.positionSlot) continue;
    const starter = players.get(entry.externalPlayerId);
    if (!starter || starter.projectedPoints === null) continue;

    const eligiblePositions = eligiblePositionsForSlot(entry.positionSlot);
    const candidates = benchPlayers.filter(
      (p) => p.projectedPoints !== null && eligiblePositions.includes(p.position),
    );
    if (candidates.length === 0) continue;

    const best = candidates.reduce((a, b) => (b.projectedPoints! > a.projectedPoints! ? b : a));
    const delta = Math.round((best.projectedPoints! - starter.projectedPoints) * 10) / 10;
    if (delta < MIN_BENCH_UPGRADE_DELTA) continue;

    flags.push({
      type: 'BENCH_PLAYER_HIGHER_PROJECTION',
      level: 'warning',
      playerId: best.externalPlayerId,
      playerName: best.fullName,
      slot: entry.positionSlot,
      message: `${best.fullName} projects +${delta.toFixed(1)} over your ${entry.positionSlot} starter, ${starter.fullName}`,
      delta,
      starterName: starter.fullName,
    });
  }
  return bestFlagPerPlayer(flags);
}
