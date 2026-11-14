import type { Cache } from '../../cache/cache.js';
import { InFlight } from '../../cache/in-flight.js';
import { readThroughShared, type SharedStore } from '../../cache/shared-store.js';
import type {
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperNflState,
  SleeperPlayersResponse,
  SleeperProjectionsResponse,
  SleeperRoster,
  SleeperSeasonStatsResponse,
  SleeperTradedPick,
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
  drafts: 5 * 60 * 1000, // 5m
  draftPicks: 10 * 1000, // 10s — polled live while a draft is running
  matchups: 30 * 1000, // 30s
  players: 24 * 60 * 60 * 1000, // 24h
  state: 5 * 60 * 1000, // 5m
  projections: 15 * 60 * 1000, // 15m
  seasonStats: 6 * 60 * 60 * 1000, // 6h — season totals only move once a week
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

/**
 * Raw HTTP client for the Sleeper API. Every call goes through the cache, and concurrent
 * calls for the same path share one request. The player DB also goes through `shared`
 * when given, so a cold instance can skip the ~5MB download.
 */
export class SleeperClient {
  private readonly inFlight = new InFlight();

  constructor(
    private readonly cache: Cache,
    private readonly baseUrl: string = BASE_URL,
    private readonly shared?: SharedStore,
  ) {}

  private fetchJson<T>(
    path: string,
    ttlMs: number,
    { baseUrl = this.baseUrl, shared = false }: { baseUrl?: string; shared?: boolean } = {},
  ): Promise<T> {
    const key = `sleeper:${path}`;
    const cached = this.cache.get<T>(key);
    if (cached !== undefined) return Promise.resolve(cached);

    return this.inFlight.run(key, async () => {
      const load = () => this.request<T>(`${baseUrl}${path}`, path);
      const result = shared
        ? await readThroughShared(this.shared, key, ttlMs, load)
        : { data: await load(), ttlMs };
      this.cache.set(key, result.data, result.ttlMs);
      return result.data;
    });
  }

  private async request<T>(url: string, path: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) {
      throw new SleeperApiError(`Sleeper API ${res.status} for ${path}`, res.status);
    }
    const data = (await res.json()) as T | null;
    // Sleeper returns 200 with a null body for unknown resources
    if (data === null) {
      throw new SleeperApiError(`Sleeper returned no data for ${path}`, 404);
    }
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

  /** Most recent draft first. */
  getDraftsForLeague(leagueId: string): Promise<SleeperDraft[]> {
    return this.fetchJson(`/league/${encodeURIComponent(leagueId)}/drafts`, TTL.drafts);
  }

  getDraftsForUser(userId: string, season: number): Promise<SleeperDraft[]> {
    return this.fetchJson(`/user/${encodeURIComponent(userId)}/drafts/nfl/${season}`, TTL.drafts);
  }

  getDraft(draftId: string): Promise<SleeperDraft> {
    return this.fetchJson(`/draft/${encodeURIComponent(draftId)}`, TTL.drafts);
  }

  /** Picks already made, ascending by pick_no. Empty until the draft starts. */
  getDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
    return this.fetchJson(`/draft/${encodeURIComponent(draftId)}/picks`, TTL.draftPicks);
  }

  getTradedDraftPicks(draftId: string): Promise<SleeperTradedPick[]> {
    return this.fetchJson(`/draft/${encodeURIComponent(draftId)}/traded_picks`, TTL.drafts);
  }

  getMatchups(leagueId: string, week: number): Promise<SleeperMatchup[]> {
    return this.fetchJson(`/league/${encodeURIComponent(leagueId)}/matchups/${week}`, TTL.matchups);
  }

  /** ~5MB response — cached for 24h, shared across instances. */
  getPlayers(): Promise<SleeperPlayersResponse> {
    return this.fetchJson('/players/nfl', TTL.players, { shared: true });
  }

  /** ~5MB response, undocumented endpoint (Backend/Data Sources.md: Sleeper NFL endpoints carry projections). */
  getProjections(season: number, week: number): Promise<SleeperProjectionsResponse> {
    return this.fetchJson(`/${season}/${week}?season_type=regular`, TTL.projections, {
      baseUrl: PROJECTIONS_BASE_URL,
    });
  }

  /** Season-to-date totals for every player, in one object. A documented /v1 endpoint, unlike projections. */
  getSeasonStats(season: number): Promise<SleeperSeasonStatsResponse> {
    return this.fetchJson(`/stats/nfl/regular/${season}`, TTL.seasonStats);
  }
}
