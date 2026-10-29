import { eligiblePositionsForSlot, starterSlotTypes } from '../../types/roster-slots.js';

export interface LineupPlayer {
  id: string;
  position: string;
  ppg: number;
}

export interface Lineup {
  /** Sum of the starters' ppg. */
  points: number;
  starters: Set<string>;
}

/**
 * The best starting lineup a set of players makes under the league's slots, by ppg. Greedy,
 * the same way `computeRosterNeeds` fills slots: dedicated slots take the best at their
 * position, then flex slots (most restrictive first) take the best eligible player left. The
 * flex eligibility sets are nested, so the greedy fill is optimal. Slots no player here can
 * fill (K, DEF, IDP) are left empty — they don't move when skill players are traded.
 */
export function optimalLineup(rosterSlots: string[], players: LineupPlayer[]): Lineup {
  const pool = [...players].sort((a, b) => b.ppg - a.ppg);
  const slots = starterSlotTypes(rosterSlots).map(eligiblePositionsForSlot);
  const ordered = [
    ...slots.filter((e) => e.length === 1),
    ...slots.filter((e) => e.length > 1).sort((a, b) => a.length - b.length),
  ];

  const starters = new Set<string>();
  let points = 0;
  for (const eligible of ordered) {
    const pick = pool.find((p) => !starters.has(p.id) && eligible.includes(p.position));
    if (!pick) continue;
    starters.add(pick.id);
    points += pick.ppg;
  }
  return { points, starters };
}
