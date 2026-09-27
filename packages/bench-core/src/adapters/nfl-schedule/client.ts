import type { Cache } from '../../cache/cache.js';
import type { NflGameState, NflWeekOpponent } from '../../types/league.js';
import type { NflGameVenue } from '../../types/weather.js';
import { mapGameStates, mapWeekOpponents, mapWeekVenues } from './mapper.js';
import type { EspnScoreboardResponse } from './types.js';

const BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

const TTL = {
  /** Short — a live slate flips pre -> in the moment a game kicks off. */
  states: 60 * 1000, // 60s
  /** Who plays whom doesn't change once a week's slate is published. */
  opponents: 6 * 60 * 60 * 1000, // 6h
  /** Venues never move, but ESPN's posted conditions and game state do. */
  venues: 30 * 60 * 1000, // 30m
} as const;

export class NflScheduleApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'NflScheduleApiError';
  }
}

/**
 * The week's NFL slate — kickoff time and pre/in/post per team. Not league-scoped:
 * one request covers every team, so every league's matchups share the same cached map.
 */
export class NflScheduleClient {
  constructor(
    private readonly cache: Cache,
    private readonly baseUrl: string = BASE_URL,
  ) {}

  /** Keyed by normalized NFL team code. Teams on bye are absent. */
  async getWeekGameStates(season: number, week: number): Promise<Map<string, NflGameState>> {
    const key = `nfl-schedule:${season}:${week}`;
    const cached = this.cache.get<Map<string, NflGameState>>(key);
    if (cached !== undefined) return cached;

    const raw = await this.fetchScoreboard(season, week);
    const states = mapGameStates(raw);
    this.cache.set(key, states, TTL.states);
    return states;
  }

  /**
   * Who each team plays that week, keyed by normalized team code. Same one-request-per-week
   * slate as {@link getWeekGameStates} — future weeks answer fine, which is what the matchup
   * scout walks. Teams on bye are absent.
   */
  async getWeekOpponents(season: number, week: number): Promise<Map<string, NflWeekOpponent>> {
    const key = `nfl-schedule:opponents:${season}:${week}`;
    const cached = this.cache.get<Map<string, NflWeekOpponent>>(key);
    if (cached !== undefined) return cached;

    const opponents = mapWeekOpponents(await this.fetchScoreboard(season, week));
    this.cache.set(key, opponents, TTL.opponents);
    return opponents;
  }

  /** Every game that week with its venue and ESPN's posted conditions — the weather client's input. */
  async getWeekVenues(season: number, week: number): Promise<NflGameVenue[]> {
    const key = `nfl-schedule:venues:${season}:${week}`;
    const cached = this.cache.get<NflGameVenue[]>(key);
    if (cached !== undefined) return cached;

    const venues = mapWeekVenues(await this.fetchScoreboard(season, week));
    this.cache.set(key, venues, TTL.venues);
    return venues;
  }

  /** Overridden by the mock client (../../mocks/nfl-schedule-client.ts). */
  protected async fetchScoreboard(season: number, week: number): Promise<EspnScoreboardResponse> {
    const path = `/scoreboard?dates=${season}&seasontype=2&week=${week}`;
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) {
      throw new NflScheduleApiError(`ESPN scoreboard ${res.status} for ${path}`, res.status);
    }
    return (await res.json()) as EspnScoreboardResponse;
  }
}
