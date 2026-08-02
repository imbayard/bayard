import type { Player, Roster } from '../../types/league.js';
import type { BenchIqFlag } from '../types.js';

export function byeWeekStarterFlags(
  roster: Roster,
  players: Map<string, Player>,
  currentWeek: number,
): BenchIqFlag[] {
  const flags: BenchIqFlag[] = [];
  for (const entry of roster.entries) {
    if (entry.slot !== 'starter') continue;
    const player = players.get(entry.externalPlayerId);
    if (!player || player.byeWeek !== currentWeek) continue;
    flags.push({
      type: 'BYE_WEEK_STARTER',
      level: 'critical',
      playerId: player.externalPlayerId,
      playerName: player.fullName,
      slot: entry.slot,
      message: `${player.fullName} is on bye this week`,
    });
  }
  return flags;
}
