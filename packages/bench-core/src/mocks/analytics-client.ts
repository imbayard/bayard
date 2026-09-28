import { AnalyticsClient } from '../adapters/analytics/client.js';
import type { AnalyticsBatchResponse } from '../adapters/analytics/types.js';
import { LruCache } from '../cache/lru-cache.js';
import { analyticsBatch } from './fixtures/analytics.js';

/**
 * Serves `./fixtures/analytics.ts` in place of the Coach backend, so the real response
 * mapping runs unchanged in mock mode. Only the requested IDs come back, like the real route.
 */
export class MockAnalyticsClient extends AnalyticsClient {
  constructor() {
    super(new LruCache(), 'mock://analytics');
  }

  protected override async fetchBatch(_source: 'sleeper' | 'espn', ids: string[]): Promise<AnalyticsBatchResponse> {
    const wanted = new Set(ids);
    return {
      ...analyticsBatch,
      players: Object.fromEntries(Object.entries(analyticsBatch.players).filter(([id]) => wanted.has(id))),
    };
  }
}
