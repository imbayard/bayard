import type { Cache } from '../../cache/cache.js';
import type { FantasyCalcValuesResponse } from './types.js';

/** Values are crowd-sourced from real trades and drift over days, not hours. */
const TTL = 6 * 60 * 60 * 1000;
const BASE_URL = 'https://api.fantasycalc.com';

export class FantasyCalcApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FantasyCalcApiError';
  }
}

/** The league shape FantasyCalc prices for — values differ by format, so it's part of the key. */
export interface MarketFormat {
  isDynasty: boolean;
  numQbs: 1 | 2;
  numTeams: number;
  /** Points per reception: 0, 0.5 or 1. */
  ppr: number;
}

/** A player's market price, from what managers actually trade him for. */
export interface MarketValue {
  value: number;
  age: number | null;
  trend30Day: number;
}

/**
 * FantasyCalc's public trade-value API (no key). Keyed by the caller's platform ID — every row
 * carries Sleeper and ESPN IDs, so nothing goes through the analytics crosswalk. Draft picks
 * come back too (position PICK, no IDs) and are dropped until Trade Radar trades picks.
 */
export class FantasyCalcClient {
  constructor(private readonly cache: Cache) {}

  async getValues(format: MarketFormat, source: 'sleeper' | 'espn'): Promise<Map<string, MarketValue>> {
    const params = new URLSearchParams({
      isDynasty: String(format.isDynasty),
      numQbs: String(format.numQbs),
      numTeams: String(format.numTeams),
      ppr: String(format.ppr),
    });
    const key = `fantasycalc:${params}`;
    let rows = this.cache.get<FantasyCalcValuesResponse>(key);
    if (rows === undefined) {
      rows = await this.fetchValues(params);
      this.cache.set(key, rows, TTL);
    }

    const values = new Map<string, MarketValue>();
    for (const row of rows) {
      const id = source === 'sleeper' ? row.player.sleeperId : row.player.espnId;
      if (!id) continue;
      values.set(id, { value: row.value, age: row.player.maybeAge ?? null, trend30Day: row.trend30Day });
    }
    return values;
  }

  /** Overridden by the mock client (../../mocks/fantasycalc-client.ts). */
  protected async fetchValues(params: URLSearchParams): Promise<FantasyCalcValuesResponse> {
    const res = await fetch(`${BASE_URL}/values/current?${params}`);
    if (!res.ok) throw new FantasyCalcApiError(`FantasyCalc ${res.status}`, res.status);
    return (await res.json()) as FantasyCalcValuesResponse;
  }
}
