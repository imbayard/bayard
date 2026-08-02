import type { Cache } from '../../cache/cache.js';
import type {
  EspnLeagueResponse,
  EspnPlayerInfoResponse,
  EspnPlayerPool,
  EspnProPlayer,
  EspnTeamDetail,
} from './types.js';

const BASE_URL = 'https://lm-api-reads.fantasy.espn.com/apis/v3';

/** Per-endpoint TTLs (Backend/Data Sources.md) */
const TTL = {
  league: 5 * 60 * 1000, // 5m
  playerPool: 24 * 60 * 60 * 1000, // 24h
  matchups: 30 * 1000, // 30s
  projections: 30 * 60 * 1000, // 30m — projections update through the week
} as const;

export class EspnApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'EspnApiError';
  }
}

export class EspnClient {
  private readonly swid: string;
  private readonly espnS2: string;

  constructor(
    private readonly cache: Cache,
    swid: string,
    espnS2: string,
    private readonly baseUrl: string = BASE_URL,
  ) {
    this.swid = swid;
    this.espnS2 = espnS2;
  }

  private getCookieHeader(): string {
    return `SWID=${this.swid}; espn_s2=${this.espnS2}`;
  }

  private async fetchJson<T>(url: string, ttlMs: number, options?: RequestInit): Promise<T> {
    const key = `espn:${url}`;
    const cached = this.cache.get<T>(key);
    if (cached !== undefined) return cached;

    const headers = {
      ...options?.headers,
      Cookie: this.getCookieHeader(),
    };

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      throw new EspnApiError(`ESPN API ${res.status} for ${url}`, res.status);
    }

    const data = (await res.json()) as T;
    this.cache.set(key, data, ttlMs);
    return data;
  }

  /**
   * Get league data with views: mSettings, mTeam, mRoster, mMatchupScore.
   * Combines league/teams/rosters/matchups in one call.
   */
  async getLeague(leagueId: string, season: number): Promise<EspnLeagueResponse> {
    const views = ['mSettings', 'mTeam', 'mRoster', 'mMatchupScore'];
    const params = views.map((v) => `view=${v}`).join('&');
    const url = `${this.baseUrl}/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?${params}`;
    return this.fetchJson<EspnLeagueResponse>(url, TTL.league);
  }

  /**
   * Get the full player pool (all NFL players) for the season. Uses the kona_player_info view so
   * each player carries injuryStatus; returns a bare array of player objects.
   */
  async getPlayerPool(season: number): Promise<EspnPlayerPool> {
    const url = `${this.baseUrl}/games/ffl/seasons/${season}/players?view=kona_player_info`;
    const filter = JSON.stringify({
      players: { limit: 2000, filterActive: { value: true } },
    });
    return this.fetchJson<EspnPlayerPool>(url, TTL.playerPool, {
      headers: {
        'x-fantasy-filter': filter,
      },
    });
  }

  /**
   * Get per-player projected (and actual) stat entries for a given week via kona_player_info.
   * Requires x-fantasy-filter scoped to the season/week stat period ids.
   */
  async getPlayerProjections(
    leagueId: string,
    season: number,
    week: number,
  ): Promise<EspnPlayerInfoResponse> {
    const url = `${this.baseUrl}/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}?view=kona_player_info`;
    const wk = String(week).padStart(2, '0');
    const filter = JSON.stringify({
      players: {
        limit: 300,
        sortPercOwned: { sortAsc: false, sortPriority: 1 },
        filterStatsForTopScoringPeriodIds: {
          value: 2,
          additionalValue: [`00${season}`, `10${season}`, `00${season}${wk}`, `10${season}${wk}`],
        },
      },
    });
    return this.fetchJson<EspnPlayerInfoResponse>(url, TTL.projections, {
      headers: {
        'x-fantasy-filter': filter,
      },
    });
  }
}
