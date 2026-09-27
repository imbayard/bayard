import type { NflScheduleClient } from '../adapters/nfl-schedule/client.js';
import { WeatherClient } from '../adapters/weather/client.js';
import type { ForecastPoint, OpenMeteoForecast } from '../adapters/weather/types.js';
import { LruCache } from '../cache/lru-cache.js';
import { openMeteoForecast } from './fixtures/weather.js';

/**
 * Serves `./fixtures/weather.ts` in place of Open-Meteo, over the mock schedule — so the real
 * stadium lookup, window pick, and assessment all run unchanged in mock mode.
 */
export class MockWeatherClient extends WeatherClient {
  constructor(schedule: NflScheduleClient) {
    super(new LruCache(), schedule);
  }

  protected override async fetchForecast(
    points: ForecastPoint[],
    startDate: string,
    endDate: string,
  ): Promise<OpenMeteoForecast[]> {
    return openMeteoForecast(points, startDate, endDate);
  }
}
