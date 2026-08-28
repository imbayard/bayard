import type { Player, Roster } from '../../types/league.js';
import type { BenchIqFlag } from '../types.js';
import { benchHigherProjectionFlags } from './bench-higher-projection.js';
import { byeWeekStarterFlags } from './bye-week-starter.js';
import { incompleteLineupFlags } from './incomplete-lineup.js';
import { startingInactiveFlags } from './starting-inactive.js';
import { waiverHigherProjectionFlags } from './waiver-higher-projection.js';

export { benchHigherProjectionFlags } from './bench-higher-projection.js';
export { byeWeekStarterFlags } from './bye-week-starter.js';
export { incompleteLineupFlags } from './incomplete-lineup.js';
export { startingInactiveFlags } from './starting-inactive.js';
export { waiverHigherProjectionFlags } from './waiver-higher-projection.js';

export function computeBenchIqFlags(
  roster: Roster,
  players: Map<string, Player>,
  currentWeek: number,
  rosterSlots: string[],
  rosteredPlayerIds: Set<string> = new Set(),
): BenchIqFlag[] {
  // An empty roster means the team hasn't drafted yet (or the league hasn't started) —
  // nothing to flag until there are actually players on it.
  if (roster.entries.length === 0) return [];

  return [
    ...byeWeekStarterFlags(roster, players, currentWeek),
    ...startingInactiveFlags(roster, players),
    ...incompleteLineupFlags(roster, rosterSlots),
    ...benchHigherProjectionFlags(roster, players),
    ...waiverHigherProjectionFlags(roster, players, rosteredPlayerIds),
  ];
}
