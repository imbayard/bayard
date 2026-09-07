import type { Cache } from '../../cache/cache.js';
import type { NflGameState } from '../../types/league.js';
import { mapGameStates } from './mapper.js';
import type { EspnScoreboardResponse } from './types.js';

const BASE_URL = 'https://site.api.espn.com/apis/site/v2/sports/football/nfl';

/** Short — a live slate flips pre -> in the moment a game kicks off. */
const TTL = 60 * 1000; // 60s

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
    this.cache.set(key, states, TTL);
    return states;
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
