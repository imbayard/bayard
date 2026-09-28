import {
  AnalyticsClient,
  EspnAdapter,
  LruCache,
  mockAnalyticsClient,
  mockEspnAdapter,
  mockNflScheduleClient,
  mockNflverseClient,
  mockSleeperAdapter,
  mockWeatherClient,
  NflScheduleClient,
  NflverseClient,
  SleeperAdapter,
  WeatherClient,
  type PlatformAdapter,
} from '@benchpoints/core';
import { env } from './env.js';

/** One shared cache behind every adapter and client. Exported so the refresh route can bust it. */
export const cache = new LruCache();

export const sleeperAdapter = new SleeperAdapter(cache);

/** Not league-scoped and unauthenticated — one instance serves every league. */
export const nflScheduleClient = new NflScheduleClient(cache);

/** Same deal: public release files, shared across every league. */
export const nflverseClient = new NflverseClient(cache);

/** Sits on the schedule client for venues; one read per week serves every league. */
export const weatherClient = new WeatherClient(cache, nflScheduleClient);

/** The analytics pipeline lives in the Coach backend, beside the integrations. */
export const analyticsClient = new AnalyticsClient(cache, env.integrationsBaseUrl, env.analyticsToken);

export const espnAdapter: EspnAdapter | undefined =
  env.espnLeagueIds.length > 0 && env.espnSwid && env.espnS2
    ? new EspnAdapter(cache, env.espnLeagueIds, env.espnSeason, env.espnSwid, env.espnS2)
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
