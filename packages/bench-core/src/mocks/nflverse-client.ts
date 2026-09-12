import { NflverseClient } from '../adapters/nflverse/client.js';
import { LruCache } from '../cache/lru-cache.js';
import { teamWeekStatsCsv } from './fixtures/nflverse.js';

/**
 * Serves the fixture in `./fixtures/nflverse.ts` in place of the real release download,
 * so the real parser and aggregate run unchanged in mock mode. Only the team weekly
 * stats asset is mocked — the O-Line pipeline reads play-by-play, which mock mode
 * doesn't surface anywhere yet.
 */
export class MockNflverseClient extends NflverseClient {
  constructor() {
    super(new LruCache());
  }

  protected override async getCsv(assetPath: string): Promise<string> {
    if (!assetPath.includes('stats_team_week')) {
      throw new Error(`MockNflverseClient has no fixture for "${assetPath}"`);
    }
    const season = Number(assetPath.match(/(\d{4})\.csv/)?.[1]);
    return teamWeekStatsCsv(Number.isFinite(season) ? season : undefined);
  }
}
