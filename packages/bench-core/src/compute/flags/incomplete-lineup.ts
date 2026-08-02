import type { Roster } from '../../types/league.js';
import { starterSlotTypes } from '../../types/roster-slots.js';
import type { BenchIqFlag } from '../types.js';

/**
 * Determines which specific starter slots are unfilled by elimination: start
 * from the league's required slot list and remove one occurrence per filled
 * starter, matched by its positionSlot label when the adapter provided one.
 * Starters without a known positionSlot (older/partial data) still consume a
 * generic slot so the count stays accurate even without a specific label.
 */
export function incompleteLineupFlags(roster: Roster, rosterSlots: string[]): BenchIqFlag[] {
  const remaining = starterSlotTypes(rosterSlots);
  const starters = roster.entries.filter((entry) => entry.slot === 'starter');

  let unknownCount = 0;
  for (const entry of starters) {
    if (!entry.positionSlot) {
      unknownCount += 1;
      continue;
    }
    const idx = remaining.indexOf(entry.positionSlot);
    if (idx !== -1) remaining.splice(idx, 1);
  }
  for (let i = 0; i < unknownCount && remaining.length > 0; i++) {
    remaining.shift();
  }

  return remaining.map((slotType) => ({
    type: 'INCOMPLETE_LINEUP',
    level: 'critical',
    playerId: null,
    playerName: null,
    slot: slotType,
    message: `${slotType} slot is unfilled`,
  }));
}
