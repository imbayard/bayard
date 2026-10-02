import type { Cache } from '../../cache/cache.js';
import type { PlayerCard, PlayerCards } from '../../types/analytics.js';
import type { AnalyticsBatchResponse } from './types.js';

/** The pipeline rebuilds at most hourly and usage moves weekly; an hour of staleness is free. */
const TTL = 60 * 60 * 1000;

export class AnalyticsApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AnalyticsApiError';
  }
}

/**
 * Reads the analytics pipeline's store (analytics.db, served by the Coach backend under
 * `/analytics`). Callers keep their platform IDs; the backend maps them to its own.
 * Not league-scoped: a card is the same whichever league a player is rostered in.
 */
export class AnalyticsClient {
  constructor(
    private readonly cache: Cache,
    private readonly baseUrl: string,
    private readonly token?: string,
  ) {}

  async getPlayerCards(source: 'sleeper' | 'espn', ids: string[], season: number): Promise<PlayerCards> {
    const wanted = [...new Set(ids)].sort();
    const key = `analytics:cards:${source}:${season}:${wanted.join(',')}`;
    const cached = this.cache.get<PlayerCards>(key);
    if (cached !== undefined) return cached;

    const body = await this.fetchBatch(source, wanted, season);
    const cards: PlayerCards = {
      season: body.season,
      week: body.week,
      asOf: body.as_of,
      players: new Map(
        Object.entries(body.players).map(([id, p]): [string, PlayerCard] => [
          id,
          { pid: p.pid, name: p.name, position: p.position, posGroup: p.pos_group, metrics: p.metrics },
        ]),
      ),
    };
    this.cache.set(key, cards, TTL);
    return cards;
  }

  /** Overridden by the mock client (../../mocks/analytics-client.ts). */
  protected async fetchBatch(
    source: 'sleeper' | 'espn',
    ids: string[],
    season: number,
  ): Promise<AnalyticsBatchResponse> {
    const params = new URLSearchParams({ source, ids: ids.join(','), season: String(season) });
    const res = await fetch(`${this.baseUrl}/analytics/players/batch?${params}`, {
      headers: this.token ? { 'x-analytics-token': this.token } : {},
    });
    if (!res.ok) throw new AnalyticsApiError(`analytics batch ${res.status}`, res.status);
    return (await res.json()) as AnalyticsBatchResponse;
  }
}
