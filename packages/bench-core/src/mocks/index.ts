import { LruCache } from '../cache/lru-cache.js';
import { SleeperAdapter } from '../adapters/sleeper/adapter.js';
import { EspnAdapter } from '../adapters/espn/adapter.js';
import { MockSleeperClient } from './sleeper-client.js';
import { MockEspnClient } from './espn-client.js';
import { MOCK_ESPN_LEAGUE_ID, MOCK_ESPN_SEASON } from './fixtures/espn.js';

export { MOCK_SLEEPER_OWNER_ID } from './fixtures/sleeper.js';
export { MOCK_ESPN_OWNER_ID } from './fixtures/espn.js';
export { MockSleeperClient } from './sleeper-client.js';
export { MockEspnClient } from './espn-client.js';

/**
 * Mock adapters are the *real* `SleeperAdapter`/`EspnAdapter` wired up with a mock HTTP client
 * instead of a real one — see `./sleeper-client.ts` / `./espn-client.ts`. The raw fixture data
 * (`./fixtures/`) only ever substitutes for the downstream API response; every mapping,
 * normalization, and compute step downstream of that is the same code path production uses.
 */
export const mockSleeperAdapter = new SleeperAdapter(new LruCache(), new MockSleeperClient());

export const mockEspnAdapter = new EspnAdapter(
  new LruCache(),
  MOCK_ESPN_LEAGUE_ID,
  MOCK_ESPN_SEASON,
  'mock-swid',
  'mock-s2',
  new MockEspnClient(),
);
