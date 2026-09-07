import { NflScheduleClient } from '../adapters/nfl-schedule/client.js';
import type { EspnScoreboardResponse } from '../adapters/nfl-schedule/types.js';
import { LruCache } from '../cache/lru-cache.js';
import { nflScoreboard } from './fixtures/nfl-schedule.js';

/**
 * Serves the fixture in `./fixtures/nfl-schedule.ts` in place of the real ESPN scoreboard call,
 * so the real mapper — team-code normalization included — runs unchanged in mock mode.
 */
export class MockNflScheduleClient extends NflScheduleClient {
  constructor() {
    super(new LruCache());
  }

  protected override async fetchScoreboard(): Promise<EspnScoreboardResponse> {
    return nflScoreboard();
  }
}
