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
export { MIN_BENCH_UPGRADE_DELTA, MIN_WAIVER_UPGRADE_DELTA } from './upgrades.js';

/**
 * A starter that both a bench player and a waiver player outproject is one problem — "this
 * starter is weak" — reported twice. Keep the bigger edge per slot; on a tie keep the bench
 * flag, since benching someone you already own costs no roster move.
 */
function collapseUpgradesPerSlot(upgrades: BenchIqFlag[]): BenchIqFlag[] {
  const best = new Map<string, BenchIqFlag>();
  for (const flag of upgrades) {
    const key = flag.slot ?? '';
    const current = best.get(key);
    if (!current || (flag.delta ?? 0) > (current.delta ?? 0)) best.set(key, flag);
  }
  return upgrades.filter((flag) => best.get(flag.slot ?? '') === flag);
}

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

  // Bench flags first so they win the per-slot tiebreak in collapseUpgradesPerSlot.
  const upgrades = [
    ...benchHigherProjectionFlags(roster, players),
    ...waiverHigherProjectionFlags(roster, players, rosteredPlayerIds),
  ];

  return [
    ...byeWeekStarterFlags(roster, players, currentWeek),
    ...startingInactiveFlags(roster, players),
    ...incompleteLineupFlags(roster, rosterSlots),
    ...collapseUpgradesPerSlot(upgrades),
  ];
}
