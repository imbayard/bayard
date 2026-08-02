import type { Player, Roster } from '../../types/league.js';
import type { BenchIqFlag } from '../types.js';

const INACTIVE_STATUSES = new Set(['Out', 'IR', 'Suspended']);

export function startingInactiveFlags(roster: Roster, players: Map<string, Player>): BenchIqFlag[] {
  const flags: BenchIqFlag[] = [];
  for (const entry of roster.entries) {
    if (entry.slot !== 'starter') continue;
    const player = players.get(entry.externalPlayerId);
    if (!player?.injuryStatus || !INACTIVE_STATUSES.has(player.injuryStatus)) continue;
    flags.push({
      type: 'STARTING_INACTIVE',
      level: 'critical',
      playerId: player.externalPlayerId,
      playerName: player.fullName,
      slot: entry.slot,
      message: `${player.fullName} is starting while marked ${player.injuryStatus}`,
    });
  }
  return flags;
}
