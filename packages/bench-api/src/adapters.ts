import {
  AnalyticsClient,
  EspnAdapter,
  EspnClient,
  FantasyCalcClient,
  LruCache,
  mockAnalyticsClient,
  mockEspnAdapter,
  mockFantasyCalcClient,
  mockNflScheduleClient,
  mockNflverseClient,
  mockSleeperAdapter,
  mockWeatherClient,
  NflScheduleClient,
  NflverseClient,
  SleeperAdapter,
  SleeperClient,
  WeatherClient,
  type PlatformAdapter,
} from '@benchpoints/core';
import { env } from './env.js';
import { blobStore } from './lib/blob-store.js';

/** One shared cache behind every adapter and client. Exported so the refresh route can bust it. */
export const cache = new LruCache();

/**
 * The 24h player pools also sit in Netlify Blobs — concurrent requests land on separate cold
 * instances, and without it each one re-downloads several MB. Nothing else goes there.
 */
export const sleeperAdapter = new SleeperAdapter(cache, new SleeperClient(cache, undefined, blobStore));

/** Not league-scoped and unauthenticated — one instance serves every league. */
export const nflScheduleClient = new NflScheduleClient(cache);

/** Same deal: public release files, shared across every league. */
export const nflverseClient = new NflverseClient(cache);

/** Sits on the schedule client for venues; one read per week serves every league. */
export const weatherClient = new WeatherClient(cache, nflScheduleClient);

/** The analytics pipeline lives in the Coach backend, beside the integrations. */
export const analyticsClient = new AnalyticsClient(cache, env.integrationsBaseUrl, env.analyticsToken);

/** FantasyCalc market values: public, keyed by league format, shared across every league. */
export const fantasyCalcClient = new FantasyCalcClient(cache);

export const espnAdapter: EspnAdapter | undefined =
  env.espnLeagueIds.length > 0 && env.espnSwid && env.espnS2
    ? new EspnAdapter(
        cache,
        env.espnLeagueIds,
        env.espnSeason,
        env.espnSwid,
        env.espnS2,
        new EspnClient(cache, env.espnSwid, env.espnS2, undefined, blobStore),
      )
    : undefined;

export class AdapterNotConfiguredError extends Error {
  constructor(platform: 'sleeper' | 'espn') {
    super(
      `"${platform}" credentials are not configured. Set the required env vars or enable mocks.`,
    );
  }
}

export function adapterFor(platform: 'sleeper' | 'espn', useMock: boolean): PlatformAdapter {
  if (useMock) {
    return platform === 'sleeper' ? mockSleeperAdapter : mockEspnAdapter;
  }
  if (platform === 'sleeper') {
    return sleeperAdapter;
  }
  if (!espnAdapter) {
    throw new AdapterNotConfiguredError('espn');
  }
  return espnAdapter;
}

export function nflScheduleFor(useMock: boolean): NflScheduleClient {
  return useMock ? mockNflScheduleClient : nflScheduleClient;
}

export function nflverseFor(useMock: boolean): NflverseClient {
  return useMock ? mockNflverseClient : nflverseClient;
}

export function weatherFor(useMock: boolean): WeatherClient {
  return useMock ? mockWeatherClient : weatherClient;
}

export function analyticsFor(useMock: boolean): AnalyticsClient {
  return useMock ? mockAnalyticsClient : analyticsClient;
}

export function fantasyCalcFor(useMock: boolean): FantasyCalcClient {
  return useMock ? mockFantasyCalcClient : fantasyCalcClient;
}
