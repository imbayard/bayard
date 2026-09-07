import type { Player, Roster } from '@benchpoints/core';

/**
 * Starters only — what a team is actually projected to score this week. Null when no starter
 * has a projection, so the client can tell "0 points" from "no data".
 */
export function sumStarterProjections(roster: Roster, players: Map<string, Player>): number | null {
  const projections = roster.entries
    .filter((e) => e.slot === 'starter')
    .map((e) => players.get(e.externalPlayerId)?.projectedPoints)
    .filter((p): p is number => p != null);
  return projections.length > 0 ? projections.reduce((a, b) => a + b, 0) : null;
}
