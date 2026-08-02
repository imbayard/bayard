import type { Cache } from '../../cache/cache.js';
import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperNflState,
  SleeperPlayersResponse,
  SleeperProjectionsResponse,
  SleeperRoster,
  SleeperUser,
} from './types.js';

const BASE_URL = 'https://api.sleeper.app/v1';
/** Projections live on a separate, undocumented base path (no /v1 prefix). */
const PROJECTIONS_BASE_URL = 'https://api.sleeper.app/projections/nfl';

/** Per-endpoint TTLs (Backend/Data Sources.md) */
const TTL = {
  user: 60 * 60 * 1000, // 1h
  leagues: 5 * 60 * 1000, // 5m
  rosters: 5 * 60 * 1000, // 5m
  matchups: 30 * 1000, // 30s
  players: 24 * 60 * 60 * 1000, // 24h
  state: 5 * 60 * 1000, // 5m
  projections: 15 * 60 * 1000, // 15m
} as const;

export class SleeperApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SleeperApiError';
  }
}

/** Raw HTTP client for the Sleeper API. Every call goes through the cache. */
export class SleeperClient {
  constructor(
    private readonly cache: Cache,
    private readonly baseUrl: string = BASE_URL,
  ) {}

  private async fetchJson<T>(path: string, ttlMs: number, baseUrl: string = this.baseUrl): Promise<T> {
    const key = `sleeper:${path}`;
    const cached = this.cache.get<T>(key);
    if (cached !== undefined) return cached;

    const res = await fetch(`${baseUrl}${path}`);
    if (!res.ok) {
      throw new SleeperApiError(`Sleeper API ${res.status} for ${path}`, res.status);
    }
    const data = (await res.json()) as T | null;
    // Sleeper returns 200 with a null body for unknown resources
    if (data === null) {
      throw new SleeperApiError(`Sleeper returned no data for ${path}`, 404);
    }
    this.cache.set(key, data, ttlMs);
    return data;
  }

  getUser(usernameOrId: string): Promise<SleeperUser> {
    return this.fetchJson(`/user/${encodeURIComponent(usernameOrId)}`, TTL.user);
  }

  getNflState(): Promise<SleeperNflState> {
    return this.fetchJson('/state/nfl', TTL.state);
  }

  getLeagues(userId: string, season: number): Promise<SleeperLeague[]> {
    return this.fetchJson(`/user/${encodeURIComponent(userId)}/leagues/nfl/${season}`, TTL.leagues);
  }

  getLeague(leagueId: string): Promise<SleeperLeague> {
    return this.fetchJson(`/league/${encodeURIComponent(leagueId)}`, TTL.leagues);
  }

  getLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[]> {
    return this.fetchJson(`/league/${encodeURIComponent(leagueId)}/users`, TTL.leagues);
  }

  getRosters(leagueId: string): Promise<SleeperRoster[]> {
    return this.fetchJson(`/league/${encodeURIComponent(leagueId)}/rosters`, TTL.rosters);
  }

  getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    return this.fetchJson(`/league/${encodeURIComponent(leagueId)}/matchups/${week}`, TTL.matchups);
  }

  /** ~5MB response — cached for 24h. */
  getPlayers(): Promise<SleeperPlayersResponse> {
    return this.fetchJson('/players/nfl', TTL.players);
  }

  /** ~5MB response, undocumented endpoint (Backend/Data Sources.md: Sleeper NFL endpoints carry projections). */
  getProjections(season: number, week: number): Promise<SleeperProjectionsResponse> {
    return this.fetchJson(`/${season}/${week}?season_type=regular`, TTL.projections, PROJECTIONS_BASE_URL);
  }
}
