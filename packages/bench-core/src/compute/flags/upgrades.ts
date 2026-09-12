import type { BenchIqFlag } from '../types.js';

/**
 * How much better a candidate has to project before we say anything. The bar is lower for a
 * bench player because you already own them — the swap is free — while a waiver claim spends a
 * roster move, so it has to be worth more than noise in the projections.
 */
export const MIN_BENCH_UPGRADE_DELTA = 1.5;
export const MIN_WAIVER_UPGRADE_DELTA = 3.0;

/**
 * One player is often the best option for several slots at once (a WR who also outprojects the
 * FLEX starter), which reads as two separate problems when it is really one player. Keep only
 * that player's biggest edge; ties keep the earlier slot, so slot order stays the tiebreak.
 */
export function bestFlagPerPlayer(flags: BenchIqFlag[]): BenchIqFlag[] {
  const best = new Map<string, BenchIqFlag>();
  for (const flag of flags) {
    const key = flag.playerId ?? '';
    const current = best.get(key);
    if (!current || (flag.delta ?? 0) > (current.delta ?? 0)) best.set(key, flag);
  }
  return flags.filter((flag) => best.get(flag.playerId ?? '') === flag);
}
