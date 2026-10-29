import { FantasyCalcClient } from '../adapters/fantasycalc/client.js';
import type { FantasyCalcValuesResponse } from '../adapters/fantasycalc/types.js';
import { LruCache } from '../cache/lru-cache.js';
import { fantasyCalcValues } from './fixtures/trades.js';

/** Serves `./fixtures/trades.ts`'s market values in place of FantasyCalc, whatever the format. */
export class MockFantasyCalcClient extends FantasyCalcClient {
  constructor() {
    super(new LruCache());
  }

  protected override async fetchValues(): Promise<FantasyCalcValuesResponse> {
    return fantasyCalcValues;
  }
}
