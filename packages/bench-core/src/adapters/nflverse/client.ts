import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import type { Cache } from '../../cache/cache.js';
import type { TeamOLineAggregate } from '../../types/nflverse.js';
import { aggregateOLine, parsePbpCsv } from './mapper.js';

const gunzipAsync = promisify(gunzip);

/** nflverse-data GitHub release holding the play-by-play CSV.gz assets. */
const BASE_URL = 'https://github.com/nflverse/nflverse-data/releases/download/pbp';

const TTL = {
  /** The parsed aggregate is expensive (multi-MB CSV) — cache a full day. */
  oline: 24 * 60 * 60 * 1000, // 24h
} as const;

export class NflverseApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'NflverseApiError';
  }
}

/**
 * Client for nflverse play-by-play release assets. Fetching + decompressing +
 * parsing a season is costly, so the expensive per-team aggregate — not the raw
 * HTTP body — is what gets cached (keyed `nflverse:oline:{season}`).
 */
export class NflverseClient {
  constructor(
    private readonly cache: Cache,
    private readonly baseUrl: string = BASE_URL,
  ) {}

  /** Downloads and gunzips a season's play-by-play CSV, returning the raw text. */
  async getPlayByPlayCsv(season: number): Promise<string> {
    const url = `${this.baseUrl}/play_by_play_${season}.csv.gz`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new NflverseApiError(`nflverse ${res.status} for ${url}`, res.status);
    }
    const gz = Buffer.from(await res.arrayBuffer());
    const csv = await gunzipAsync(gz);
    return csv.toString('utf8');
  }

  /**
   * Per-team O-Line aggregate for a season. Cached under `nflverse:oline:{season}`
   * so we never re-download or re-parse the CSV within the TTL window.
   */
  async getOLineAggregates(season: number): Promise<TeamOLineAggregate[]> {
    const key = `nflverse:oline:${season}`;
    const cached = this.cache.get<TeamOLineAggregate[]>(key);
    if (cached !== undefined) return cached;

    const csv = await this.getPlayByPlayCsv(season);
    const aggregates = aggregateOLine(parsePbpCsv(csv));
    this.cache.set(key, aggregates, TTL.oline);
    return aggregates;
  }
}
