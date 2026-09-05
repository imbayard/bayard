import { eligiblePositionsForSlot, starterSlotTypes } from '../types/roster-slots.js';

export interface PositionNeed {
  /** Slot label from the league's lineup, e.g. 'QB', 'RB', 'FLEX', 'SUPER_FLEX'. */
  slot: string;
  filled: number;
  required: number;
  /** Positions that can fill this slot — ['RB','WR','TE'] for FLEX, ['QB'] for QB. */
  eligible: string[];
}

export interface RosterNeeds {
  /** One entry per distinct starter slot, in the league's own slot order. */
  needs: PositionNeed[];
  /** Players drafted beyond the starting lineup — depth, not need. */
  surplusByPosition: Record<string, number>;
  /** Total unfilled starter slots. */
  remaining: number;
}

/**
 * How much of a starting lineup a set of drafted players covers — the inverse of
 * `incompleteLineupFlags`, which eliminates slots from an already-filled roster.
 *
 * Two greedy passes, which is optimal here rather than merely convenient: dedicated slots
 * are forced (only one position can ever fill them), and the flex eligibility sets are
 * nested (WRRB ⊂ FLEX ⊂ SUPER_FLEX, REC_FLEX ⊂ FLEX ⊂ SUPER_FLEX), so filling the most
 * restrictive flex first can never strand a player that a looser slot needed.
 *
 * Takes bare positions rather than picks, so it serves a drafted roster, an existing
 * roster, or a hypothetical one.
 */
export function computeRosterNeeds(rosterSlots: string[], positions: string[]): RosterNeeds {
  const required = new Map<string, number>();
  const slotOrder: string[] = [];
  for (const slot of starterSlotTypes(rosterSlots)) {
    if (!required.has(slot)) slotOrder.push(slot);
    required.set(slot, (required.get(slot) ?? 0) + 1);
  }

  // Players still available to fill a slot, by position.
  const pool = new Map<string, number>();
  for (const position of positions) {
    const key = position.trim().toUpperCase();
    if (key !== '') pool.set(key, (pool.get(key) ?? 0) + 1);
  }

  const filled = new Map<string, number>();

  // Pass 1: dedicated slots, which nothing else can fill.
  for (const slot of slotOrder) {
    const eligible = eligiblePositionsForSlot(slot);
    if (eligible.length !== 1) continue;
    const position = eligible[0]!;
    const take = Math.min(required.get(slot) ?? 0, pool.get(position) ?? 0);
    filled.set(slot, take);
    pool.set(position, (pool.get(position) ?? 0) - take);
  }

  // Pass 2: flex slots, most restrictive first, each drawing from the deepest eligible pool.
  const flexSlots = slotOrder
    .filter((slot) => eligiblePositionsForSlot(slot).length > 1)
    .sort((a, b) => eligiblePositionsForSlot(a).length - eligiblePositionsForSlot(b).length);

  for (const slot of flexSlots) {
    const eligible = eligiblePositionsForSlot(slot);
    const capacity = required.get(slot) ?? 0;
    let take = 0;
    while (take < capacity) {
      const deepest = eligible.reduce((best, position) =>
        (pool.get(position) ?? 0) > (pool.get(best) ?? 0) ? position : best,
      );
      if ((pool.get(deepest) ?? 0) <= 0) break;
      pool.set(deepest, (pool.get(deepest) ?? 0) - 1);
      take += 1;
    }
    filled.set(slot, take);
  }

  const needs = slotOrder.map((slot) => ({
    slot,
    filled: filled.get(slot) ?? 0,
    required: required.get(slot) ?? 0,
    eligible: eligiblePositionsForSlot(slot),
  }));

  const surplusByPosition: Record<string, number> = {};
  for (const [position, count] of pool) {
    if (count > 0) surplusByPosition[position] = count;
  }

  return {
    needs,
    surplusByPosition,
    remaining: needs.reduce((sum, need) => sum + (need.required - need.filled), 0),
  };
}
