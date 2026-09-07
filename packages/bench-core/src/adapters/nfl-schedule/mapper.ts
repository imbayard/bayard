import type { NflGameState } from '../../types/league.js';
import { normalizeTeamCode } from '../nflverse/team-codes.js';
import type { EspnScoreboardResponse } from './types.js';

const STATES = new Set(['pre', 'in', 'post']);

/**
 * One entry per team playing that week, keyed by normalized team code so the map
 * key-joins against `Player.nflTeam`. Teams on bye simply have no entry.
 */
export function mapGameStates(raw: EspnScoreboardResponse): Map<string, NflGameState> {
  const states = new Map<string, NflGameState>();
  for (const event of raw.events ?? []) {
    if (!STATES.has(event.status.type.state)) continue;
    // ESPN writes kickoffs at minute precision ("...T00:20Z"); normalize so callers can
    // compare and sort these as plain strings.
    const parsed = new Date(event.date);
    if (Number.isNaN(parsed.getTime())) continue;
    const kickoff = parsed.toISOString();
    const state = event.status.type.state as NflGameState['state'];

    for (const competition of event.competitions) {
      for (const { team } of competition.competitors) {
        const code = normalizeTeamCode(team.abbreviation);
        states.set(code, { team: code, kickoff, state });
      }
    }
  }
  return states;
}
