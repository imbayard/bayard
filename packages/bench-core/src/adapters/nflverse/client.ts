import { promisify } from 'node:util';
import { gunzip } from 'node:zlib';
import type { Cache } from '../../cache/cache.js';
import type { TeamGiveawayAggregate, TeamOLineAggregate } from '../../types/nflverse.js';
import { aggregateOLine, parsePbpCsv } from './mapper.js';
import { aggregateGiveaway, parseTeamWeekCsv } from './team-stats.js';

const gunzipAsync = promisify(gunzip);

/** Root of the nflverse-data GitHub releases; each asset lives under its own release tag. */
const BASE_URL = 'https://github.com/nflverse/nflverse-data/releases/download';

const TTL = {
  /** The parsed aggregate is expensive (multi-MB CSV) — cache a full day. */
  oline: 24 * 60 * 60 * 1000, // 24h
  /** Same shape of work on a far smaller asset, and it only moves once a week. */
  giveaway: 12 * 60 * 60 * 1000, // 12h
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
  getPlayByPlayCsv(season: number): Promise<string> {
    return this.getCsv(`pbp/play_by_play_${season}.csv.gz`);
  }

  /** Downloads and gunzips a season's team weekly stats CSV, returning the raw text. */
  getTeamWeekStatsCsv(season: number): Promise<string> {
    return this.getCsv(`stats_team/stats_team_week_${season}.csv.gz`);
  }

  /** Fetch + gunzip one gzipped CSV release asset. Overridden by tests/mocks. */
  protected async getCsv(assetPath: string): Promise<string> {
    const url = `${this.baseUrl}/${assetPath}`;
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

  /**
   * Per-offense giveaway aggregate for a season, optionally cut off at `throughWeek` so a
   * mid-season ask isn't scored on games that haven't happened. Cached under
   * `nflverse:giveaway:{season}:{throughWeek}` — the cutoff is part of the key because two
   * different cutoffs are two different answers off the same download.
   */
  async getGiveawayAggregates(season: number, throughWeek?: number): Promise<TeamGiveawayAggregate[]> {
    const key = `nflverse:giveaway:${season}:${throughWeek ?? 'all'}`;
    const cached = this.cache.get<TeamGiveawayAggregate[]>(key);
    if (cached !== undefined) return cached;

    const csv = await this.getTeamWeekStatsCsv(season);
    const aggregates = aggregateGiveaway(parseTeamWeekCsv(csv), { throughWeek });
    this.cache.set(key, aggregates, TTL.giveaway);
    return aggregates;
  }
}
