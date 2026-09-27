import { describe, expect, it } from 'vitest';
import { LruCache } from '../../cache/lru-cache.js';
import type { NflScheduleClient } from '../nfl-schedule/client.js';
import { mapWeekVenues } from '../nfl-schedule/mapper.js';
import type { NflGameVenue } from '../../types/weather.js';
import { WeatherClient } from './client.js';
import type { ForecastPoint, OpenMeteoForecast } from './types.js';

const NOW = Date.parse('2026-12-18T12:00:00Z');
const HOUR = 3_600_000;

function venue(overrides: Partial<NflGameVenue>): NflGameVenue {
  return {
    home: 'GB',
    away: 'HOU',
    kickoff: new Date(NOW + 24 * HOUR).toISOString(),
    state: 'pre',
    neutralSite: false,
    venueName: 'Lambeau Field',
    indoor: false,
    espnWeather: null,
    ...overrides,
  };
}

function schedule(games: NflGameVenue[]): NflScheduleClient {
  return { getWeekVenues: async () => games } as unknown as NflScheduleClient;
}

/** Records every forecast request and answers with a flat 24 mph wind everywhere. */
class StubClient extends WeatherClient {
  calls: ForecastPoint[][] = [];
  fail = false;

  constructor(games: NflGameVenue[], readonly store = new LruCache()) {
    super(store, schedule(games), undefined, () => NOW);
  }

  protected override async fetchForecast(points: ForecastPoint[]): Promise<OpenMeteoForecast[]> {
    this.calls.push(points);
    if (this.fail) throw new Error('down');
    const time = Array.from({ length: 24 * 10 }, (_, i) => new Date(NOW + i * HOUR).toISOString().slice(0, 16));
    const fill = (v: number) => time.map(() => v);
    return points.map(() => ({
      hourly: {
        time,
        temperature_2m: fill(30),
        wind_speed_10m: fill(24),
        wind_gusts_10m: fill(30),
        rain: fill(0),
        showers: fill(0),
        snowfall: fill(0),
        precipitation_probability: fill(10),
      },
    }));
  }
}

describe('WeatherClient', () => {
  it('forecasts open-air games in one request and keys both sides', async () => {
    const client = new StubClient([venue({}), venue({ home: 'CHI', away: 'DET', venueName: 'Soldier Field' })]);
    const weather = await client.getWeekWeather(2026, 16);
    expect(client.calls).toHaveLength(1);
    expect(client.calls[0]!.map((p) => p.team)).toEqual(['GB', 'CHI']);
    expect(weather.get('HOU')).toBe(weather.get('GB'));
    expect(weather.get('GB')).toMatchObject({ source: 'forecast', severity: 'harsh', roof: 'open' });
  });

  it('never forecasts under a roof, even a retractable one', async () => {
    const client = new StubClient([venue({ home: 'DET', away: 'GB' }), venue({ home: 'IND', away: 'TEN' })]);
    const weather = await client.getWeekWeather(2026, 16);
    expect(client.calls).toHaveLength(0);
    expect(weather.get('DET')).toMatchObject({ roof: 'dome', severity: 'none', source: 'none' });
    expect(weather.get('IND')?.roof).toBe('retractable');
  });

  it('leaves games past the horizon and finished games alone', async () => {
    const client = new StubClient([
      venue({ kickoff: new Date(NOW + 9 * 24 * HOUR).toISOString() }),
      venue({ home: 'CHI', away: 'DET', state: 'post', kickoff: new Date(NOW - 30 * HOUR).toISOString() }),
    ]);
    const weather = await client.getWeekWeather(2026, 16);
    expect(client.calls).toHaveLength(0);
    expect(weather.get('GB')?.source).toBe('none');
  });

  it("falls back to ESPN's conditions for a neutral site or a failed forecast", async () => {
    const neutral = venue({ home: 'DAL', away: 'KC', neutralSite: true, espnWeather: { tempF: 70, condition: 'Heavy rain' } });
    const wet = venue({ espnWeather: { tempF: 40, condition: 'Light rain' } });
    const client = new StubClient([neutral, wet]);
    client.fail = true;
    const weather = await client.getWeekWeather(2026, 16);
    expect(weather.get('DAL')).toMatchObject({ source: 'espn', severity: 'harsh', roof: 'open' });
    expect(weather.get('GB')).toMatchObject({ source: 'espn', severity: 'notable' });
  });

  it('caches by how close the nearest game is', async () => {
    const soon = new StubClient([venue({})]);
    await soon.getWeekWeather(2026, 16);
    await soon.getWeekWeather(2026, 16);
    expect(soon.calls).toHaveLength(1);

    // A failed forecast is cached briefly, not for the tier's full span.
    const failing = new StubClient([venue({})]);
    failing.fail = true;
    await failing.getWeekWeather(2026, 16);
    expect(failing.store.get('weather:2026:16')).toBeDefined();
  });
});

describe('mapWeekVenues', () => {
  it("reads venue, neutral site, and whichever ESPN string is the sentence", () => {
    const games = mapWeekVenues({
      events: [
        {
          date: '2026-09-27T20:05Z',
          status: { type: { state: 'pre' } },
          weather: { displayValue: 'Mostly cloudy', conditionId: '6', temperature: 70 },
          competitions: [
            {
              competitors: [
                { team: { abbreviation: 'WSH' }, homeAway: 'home' },
                { team: { abbreviation: 'NYG' }, homeAway: 'away' },
              ],
              venue: { fullName: 'Northwest Stadium', indoor: false },
            },
          ],
        },
        {
          date: '2026-09-27T17:00Z',
          status: { type: { state: 'in' } },
          weather: { displayValue: '12', conditionId: 'Light rain', temperature: 62 },
          competitions: [
            {
              competitors: [
                { team: { abbreviation: 'DAL' }, homeAway: 'home' },
                { team: { abbreviation: 'KC' }, homeAway: 'away' },
              ],
              neutralSite: true,
            },
          ],
        },
      ],
    });
    expect(games).toEqual([
      {
        home: 'WAS',
        away: 'NYG',
        kickoff: '2026-09-27T20:05:00.000Z',
        state: 'pre',
        neutralSite: false,
        venueName: 'Northwest Stadium',
        indoor: false,
        espnWeather: { tempF: 70, condition: 'Mostly cloudy' },
      },
      {
        home: 'DAL',
        away: 'KC',
        kickoff: '2026-09-27T17:00:00.000Z',
        state: 'in',
        neutralSite: true,
        venueName: null,
        indoor: null,
        espnWeather: { tempF: 62, condition: 'Light rain' },
      },
    ]);
  });
});
