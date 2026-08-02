export const NON_STARTER_SLOTS = new Set(['BN', 'IR']);

/** League rosterSlots (e.g. ['QB','RB','RB','FLEX','K','DEF','BN','BN']) minus bench/IR, in order. */
export function starterSlotTypes(rosterSlots: string[]): string[] {
  return rosterSlots.filter((slot) => !NON_STARTER_SLOTS.has(slot));
}

/**
 * Which player positions can fill a given roster slot label. Covers Sleeper's known
 * `roster_positions` vocabulary. Slots not listed here (exotic/IDP slots, etc.) fall back
 * to an exact-position match via `eligiblePositionsForSlot`.
 */
const ELIGIBLE_POSITIONS: Record<string, string[]> = {
  FLEX: ['RB', 'WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  REC_FLEX: ['WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  OP: ['QB', 'RB', 'WR', 'TE'],
};

/** Positions eligible to fill `slot`; defaults to an exact match when the slot has no special eligibility. */
export function eligiblePositionsForSlot(slot: string): string[] {
  return ELIGIBLE_POSITIONS[slot] ?? [slot];
}
