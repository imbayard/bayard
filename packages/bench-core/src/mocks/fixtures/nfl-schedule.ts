/**
 * Raw ESPN scoreboard fixture — shaped exactly like what `NflScheduleClient` would get back
 * from a real `fetch()`, before any mapping. `MockNflScheduleClient` (../nfl-schedule-client.ts)
 * serves it in place of the real HTTP call.
 *
 * Kickoffs are relative to *now* so mock mode exercises both Command Deck states at once:
 * the Redraft Rebels slate is already underway (live score vs. projection) while the Dynasty
 * Dumpster Fire slate is entirely pre-kickoff (countdown). Note BAL sits on both rosters, so
 * it has to be the pre game — the Rebels' other starters are what makes that league live.
 */
import type { EspnScoreboardResponse } from '../../adapters/nfl-schedule/types.js';

const HOUR = 60 * 60 * 1000;

/** [away, home, hours from now, state] — negative hours are games already kicked off. */
const SLATE: [string, string, number, 'pre' | 'in' | 'post'][] = [
  // Redraft Rebels (mock-sleeper-1) and the mock ESPN league: underway.
  ['DAL', 'PHI', -50, 'post'],
  ['SF', 'MIA', -26, 'post'],
  ['BUF', 'CIN', -3, 'in'],
  ['DET', 'KC', -2, 'in'],
  ['ARI', 'NYJ', -2, 'in'],
  ['JAX', 'PIT', -26, 'post'],
  ['LV', 'CHI', -3, 'in'],
  // Dynasty Dumpster Fire (mock-sleeper-2): every starter still to play.
  ['MIN', 'LAC', 4, 'pre'],
  ['NO', 'SEA', 4, 'pre'],
  ['HOU', 'GB', 27, 'pre'],
  ['CLE', 'TB', 27, 'pre'],
  ['ATL', 'BAL', 51, 'pre'],
  ['IND', 'WSH', 51, 'pre'],
  ['NE', 'DEN', 51, 'pre'],
  ['TEN', 'NYG', 75, 'pre'],
];

export function nflScoreboard(): EspnScoreboardResponse {
  const now = Date.now();
  return {
    events: SLATE.map(([away, home, hours, state]) => ({
      date: new Date(now + hours * HOUR).toISOString(),
      status: { type: { state } },
      competitions: [
        { competitors: [{ team: { abbreviation: home } }, { team: { abbreviation: away } }] },
      ],
    })),
  };
}
