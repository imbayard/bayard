import {
  EspnAdapter,
  LruCache,
  mockEspnAdapter,
  mockSleeperAdapter,
  SleeperAdapter,
  type PlatformAdapter,
} from '@benchpoints/core';
import { env } from './env.js';

const cache = new LruCache();

export const sleeperAdapter = new SleeperAdapter(cache);

export const espnAdapter: EspnAdapter | undefined =
  env.espnLeagueId && env.espnSwid && env.espnS2
    ? new EspnAdapter(cache, env.espnLeagueId, env.espnSeason, env.espnSwid, env.espnS2)
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
