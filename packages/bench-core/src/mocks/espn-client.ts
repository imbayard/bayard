import { LruCache } from '../cache/lru-cache.js';
import { EspnClient } from '../adapters/espn/client.js';
import type {
  EspnLeagueResponse,
  EspnPlayerInfoResponse,
  EspnPlayerPool,
} from '../adapters/espn/types.js';
import { espnLeague, espnPlayerPool, espnPlayerProjections } from './fixtures/espn.js';

/**
 * Serves the raw fixtures in `./fixtures/espn.ts` in place of real HTTP calls. Subclasses the
 * real `EspnClient` and overrides every method, so `EspnAdapter` — and its mapper — run
 * completely unmodified against this data.
 */
export class MockEspnClient extends EspnClient {
  constructor() {
    super(new LruCache(), 'mock-swid', 'mock-s2');
  }

  override async getLeague(): Promise<EspnLeagueResponse> {
    return espnLeague;
  }

  override async getPlayerPool(): Promise<EspnPlayerPool> {
    return espnPlayerPool;
  }

  override async getPlayerProjections(): Promise<EspnPlayerInfoResponse> {
    return espnPlayerProjections;
  }
}
