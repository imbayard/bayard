import type { Player, Roster } from '../../types/league.js';
import type { GameWeather } from '../../types/weather.js';
import type { BenchIqFlag } from '../types.js';
import { weatherExposure } from '../weather.js';

/**
 * A starter heading into harsh weather that hits their position — a QB in 25 mph wind, a
 * kicker in heavy snow. Notable-but-playable weather stays off the flag list; the roster
 * view and the email carry it instead.
 */
export function weatherRiskFlags(
  roster: Roster,
  players: Map<string, Player>,
  weather: Map<string, GameWeather>,
): BenchIqFlag[] {
  return weatherExposure(roster, players, weather)
    .filter((e) => e.severity === 'harsh')
    .map((e) => {
      const harsh = e.notes.filter((n) => n.severity === 'harsh').map((n) => n.label);
      const where = e.weather.venueName ? ` at ${e.weather.venueName}` : '';
      return {
        type: 'WEATHER_RISK',
        level: 'warning',
        playerId: e.playerId,
        playerName: e.playerName,
        slot: 'starter',
        message: `${e.playerName} (${e.position}) plays in ${harsh.join(', ').toLowerCase()}${where}`,
        delta: null,
        starterName: null,
      };
    });
}
