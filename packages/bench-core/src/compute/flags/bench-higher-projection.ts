import type { Player, Roster } from '../../types/league.js';
import { eligiblePositionsForSlot } from '../../types/roster-slots.js';
import type { BenchIqFlag } from '../types.js';

/**
 * Flags the single best-projected bench player eligible for each starter slot, when it
 * outprojects the starter — one flag per slot, not per bench player, to keep signal quality high.
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
    if (best.projectedPoints! <= starter.projectedPoints) continue;

    flags.push({
      type: 'BENCH_PLAYER_HIGHER_PROJECTION',
      level: 'warning',
      playerId: best.externalPlayerId,
      playerName: best.fullName,
      slot: entry.positionSlot,
      message: `${best.fullName} projects higher than your ${entry.positionSlot} starter, ${starter.fullName}`,
    });
  }
  return flags;
}
