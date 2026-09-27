import type { Roster } from '@benchpoints/core';

/**
 * Every player owned by anyone in the league. The complement is the waiver wire, which is
 * why bench-iq, scout and the digest all need the same set built the same way.
 */
export function rosteredPlayerIds(rosters: Roster[]): Set<string> {
  return new Set(rosters.flatMap((r) => r.entries.map((e) => e.externalPlayerId)));
}
