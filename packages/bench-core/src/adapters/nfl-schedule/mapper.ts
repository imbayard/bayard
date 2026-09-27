import type { NflGameState, NflWeekOpponent } from '../../types/league.js';
import type { NflGameVenue } from '../../types/weather.js';
import { normalizeTeamCode } from '../nflverse/team-codes.js';
import type { EspnScoreboardEvent, EspnScoreboardResponse } from './types.js';

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

/**
 * One entry per team playing that week, giving the team it faces. Same key vocabulary as
 * {@link mapGameStates}, so a bye is again just an absent entry. Unlike game states this
 * needs both sides of a competition at once, so a game with anything other than exactly
 * two competitors is skipped rather than half-mapped.
 *
 * Every state is kept, `post` included: a finished game is still the opponent that was played,
 * and callers ask about future weeks where everything is `pre` anyway.
 */
export function mapWeekOpponents(raw: EspnScoreboardResponse): Map<string, NflWeekOpponent> {
  const opponents = new Map<string, NflWeekOpponent>();
  for (const event of raw.events ?? []) {
    if (!STATES.has(event.status.type.state)) continue;
    const parsed = new Date(event.date);
    if (Number.isNaN(parsed.getTime())) continue;
    const kickoff = parsed.toISOString();

    for (const competition of event.competitions) {
      const competitors = competition.competitors ?? [];
      if (competitors.length !== 2) continue;
      const [first, second] = competitors as [
        (typeof competitors)[number],
        (typeof competitors)[number],
      ];

      for (const [side, other] of [
        [first, second],
        [second, first],
      ] as const) {
        const team = normalizeTeamCode(side.team.abbreviation);
        opponents.set(team, {
          team,
          opponent: normalizeTeamCode(other.team.abbreviation),
          // ESPN omits homeAway on some payloads; say "unknown" rather than guess from order.
          home: side.homeAway === undefined ? null : side.homeAway === 'home',
          kickoff,
        });
      }
    }
  }
  return opponents;
}

/** Whichever of ESPN's two weather strings is the sentence rather than a condition code. */
function conditionText(weather: NonNullable<EspnScoreboardEvent['weather']>): string | null {
  for (const candidate of [weather.displayValue, weather.conditionId]) {
    if (candidate && !/^\d+$/.test(candidate.trim())) return candidate.trim();
  }
  return null;
}

/**
 * One entry per game, with where it's played and ESPN's brief conditions. Unlike the maps
 * above this is per game, not per team — a stadium hosts a game, not a side. A game without
 * a clear home team is skipped: without one there's no stadium to look up.
 */
export function mapWeekVenues(raw: EspnScoreboardResponse): NflGameVenue[] {
  const games: NflGameVenue[] = [];
  for (const event of raw.events ?? []) {
    if (!STATES.has(event.status.type.state)) continue;
    const parsed = new Date(event.date);
    if (Number.isNaN(parsed.getTime())) continue;

    for (const competition of event.competitions) {
      const home = competition.competitors.find((c) => c.homeAway === 'home');
      const away = competition.competitors.find((c) => c.homeAway === 'away');
      if (!home || !away) continue;
      games.push({
        home: normalizeTeamCode(home.team.abbreviation),
        away: normalizeTeamCode(away.team.abbreviation),
        kickoff: parsed.toISOString(),
        state: event.status.type.state as NflGameVenue['state'],
        neutralSite: competition.neutralSite ?? false,
        venueName: competition.venue?.fullName ?? null,
        indoor: competition.venue?.indoor ?? null,
        espnWeather: event.weather
          ? { tempF: event.weather.temperature ?? null, condition: conditionText(event.weather) }
          : null,
      });
    }
  }
  return games;
}
