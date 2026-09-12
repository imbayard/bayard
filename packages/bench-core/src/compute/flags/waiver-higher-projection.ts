import type { Player, Roster } from '../../types/league.js';
import { eligiblePositionsForSlot } from '../../types/roster-slots.js';
import type { BenchIqFlag } from '../types.js';
import { MIN_WAIVER_UPGRADE_DELTA, bestFlagPerPlayer } from './upgrades.js';

/**
 * Flags the single best-projected unrostered (waiver-wire) player eligible for each starter slot,
 * when it beats the starter by at least `MIN_WAIVER_UPGRADE_DELTA` — one flag per slot and then
 * one per player, mirroring `benchHigherProjectionFlags`.
 */
export function waiverHigherProjectionFlags(
  roster: Roster,
  players: Map<string, Player>,
  rosteredPlayerIds: Set<string>,
): BenchIqFlag[] {
  const flags: BenchIqFlag[] = [];
  const waiverPlayers = Array.from(players.values()).filter(
    (p) => p.projectedPoints !== null && !rosteredPlayerIds.has(p.externalPlayerId),
  );
  if (waiverPlayers.length === 0) return flags;

  for (const entry of roster.entries) {
    if (entry.slot !== 'starter' || !entry.positionSlot) continue;
    const starter = players.get(entry.externalPlayerId);
    if (!starter || starter.projectedPoints === null) continue;

    const eligiblePositions = eligiblePositionsForSlot(entry.positionSlot);
    const candidates = waiverPlayers.filter((p) => eligiblePositions.includes(p.position));
    if (candidates.length === 0) continue;

    const best = candidates.reduce((a, b) => (b.projectedPoints! > a.projectedPoints! ? b : a));
    const delta = Math.round((best.projectedPoints! - starter.projectedPoints) * 10) / 10;
    if (delta < MIN_WAIVER_UPGRADE_DELTA) continue;

    flags.push({
      type: 'WAIVER_PLAYER_HIGHER_PROJECTION',
      level: 'warning',
      playerId: best.externalPlayerId,
      playerName: best.fullName,
      slot: entry.positionSlot,
      message: `${best.fullName} is on waivers and projects +${delta.toFixed(1)} over your ${entry.positionSlot} starter, ${starter.fullName}`,
      delta,
      starterName: starter.fullName,
    });
  }
  return bestFlagPerPlayer(flags);
}
