import type { Cache } from '../../cache/cache.js';
import { assessConditions } from '../../compute/weather.js';
import type { GameConditions, GameWeather, NflGameVenue, RoofType } from '../../types/weather.js';
import type { NflScheduleClient } from '../nfl-schedule/client.js';
import { STADIUMS } from './stadiums.js';
import type { ForecastPoint, OpenMeteoForecast } from './types.js';

const BASE_URL = 'https://api.open-meteo.com/v1/forecast';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** Past a week out a forecast is climate, not weather — say nothing rather than guess. */
const FORECAST_HORIZON_MS = 7 * 24 * HOUR;
/** Kickoff through the fourth quarter; a game's weather is its worst hour in here. */
const GAME_WINDOW_HOURS = 3;

/**
 * How long a week's read stays good, by how close its nearest unfinished game is. First match
 * wins. Forecast models refresh roughly hourly, and within two days of kickoff is when a
 * lineup call actually hangs on them; before that a few hours' staleness changes nothing.
 */
const TTL_TIERS: { within: number; ttl: number }[] = [
  { within: 48 * HOUR, ttl: 30 * MINUTE },
  { within: FORECAST_HORIZON_MS, ttl: 3 * HOUR },
  { within: Infinity, ttl: 6 * HOUR },
];
/** A failed forecast falls back to ESPN; retry soon rather than sit on the fallback for hours. */
const FAILURE_TTL = 5 * MINUTE;

const HOURLY_FIELDS = [
  'temperature_2m',
  'wind_speed_10m',
  'wind_gusts_10m',
  'rain',
  'showers',
  'snowfall',
  'precipitation_probability',
] as const;

export class WeatherApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'WeatherApiError';
  }
}

function isCovered(roof: RoofType | 'unknown'): boolean {
  return roof === 'dome' || roof === 'retractable';
}

function roofFor(game: NflGameVenue): RoofType | 'unknown' {
  const stadium = game.neutralSite ? undefined : STADIUMS[game.home];
  if (stadium) return stadium.roof;
  return game.indoor === null ? 'unknown' : game.indoor ? 'dome' : 'open';
}

function max(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  return present.length > 0 ? Math.max(...present) : null;
}

/** The game window's worst hour, out of one location's hourly series. Null if the window isn't covered. */
function windowConditions(forecast: OpenMeteoForecast, kickoff: string): GameConditions | null {
  const start = new Date(kickoff).getTime() - (new Date(kickoff).getTime() % HOUR);
  const end = start + GAME_WINDOW_HOURS * HOUR;
  const { hourly } = forecast;
  const idx = hourly.time
    .map((t, i) => [new Date(`${t}Z`).getTime(), i] as const)
    .filter(([t]) => t >= start && t <= end)
    .map(([, i]) => i);
  if (idx.length === 0) return null;

  const pick = (field: (typeof HOURLY_FIELDS)[number]) => idx.map((i) => hourly[field][i] ?? null);
  const rain = idx.map((i) => {
    const r = hourly.rain[i];
    const s = hourly.showers[i];
    return r === null && s === null ? null : (r ?? 0) + (s ?? 0);
  });
  return {
    tempF: pick('temperature_2m')[0] ?? null,
    windMph: max(pick('wind_speed_10m')),
    gustMph: max(pick('wind_gusts_10m')),
    rainIn: max(rain),
    snowIn: max(pick('snowfall')),
    precipChance: max(pick('precipitation_probability')),
    condition: null,
  };
}

function utcDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The week's weather, one assessed read per game. ESPN's scoreboard says where each game is
 * and whether it's indoors; Open-Meteo forecasts the open-air ones inside a week of kickoff,
 * all stadiums in a single request. When the forecast is unavailable, ESPN's own posted
 * conditions stand in — thinner (a temperature and a sentence), but never nothing.
 *
 * Not league-scoped: one read per week serves every league, like the schedule it sits on.
 */
export class WeatherClient {
  constructor(
    private readonly cache: Cache,
    private readonly schedule: NflScheduleClient,
    private readonly baseUrl: string = BASE_URL,
    private readonly now: () => number = Date.now,
  ) {}

  /** Keyed by normalized team code — both sides of a game point at the same read. Byes are absent. */
  async getWeekWeather(season: number, week: number): Promise<Map<string, GameWeather>> {
    const key = `weather:${season}:${week}`;
    const cached = this.cache.get<Map<string, GameWeather>>(key);
    if (cached !== undefined) return cached;

    const games = await this.schedule.getWeekVenues(season, week);
    const now = this.now();

    const forecastable = games.filter((g) => {
      const kickoff = new Date(g.kickoff).getTime();
      return (
        !g.neutralSite &&
        g.state !== 'post' &&
        STADIUMS[g.home]?.roof === 'open' &&
        kickoff - now <= FORECAST_HORIZON_MS &&
        kickoff + GAME_WINDOW_HOURS * HOUR > now
      );
    });

    let forecasts = new Map<NflGameVenue, OpenMeteoForecast>();
    let failed = false;
    if (forecastable.length > 0) {
      try {
        forecasts = await this.forecast(forecastable);
      } catch {
        failed = true;
      }
    }

    const byTeam = new Map<string, GameWeather>();
    for (const game of games) {
      const weather = this.assess(game, forecasts.get(game));
      byTeam.set(game.home, weather);
      byTeam.set(game.away, weather);
    }

    this.cache.set(key, byTeam, failed ? FAILURE_TTL : ttlFor(games, now));
    return byTeam;
  }

  private assess(game: NflGameVenue, forecast: OpenMeteoForecast | undefined): GameWeather {
    const roof = roofFor(game);
    const base = {
      home: game.home,
      away: game.away,
      kickoff: game.kickoff,
      state: game.state,
      venueName: game.venueName,
      roof,
    };
    if (isCovered(roof)) return { ...base, source: 'none', conditions: null, severity: 'none', notes: [] };

    const measured = forecast ? windowConditions(forecast, game.kickoff) : null;
    const conditions: GameConditions | null = measured
      ? { ...measured, condition: game.espnWeather?.condition ?? null }
      : game.espnWeather
        ? {
            tempF: game.espnWeather.tempF,
            windMph: null,
            gustMph: null,
            rainIn: null,
            snowIn: null,
            precipChance: null,
            condition: game.espnWeather.condition,
          }
        : null;
    const source = measured ? 'forecast' : conditions ? 'espn' : 'none';
    return { ...base, source, conditions, ...assessConditions(conditions) };
  }

  private async forecast(games: NflGameVenue[]): Promise<Map<NflGameVenue, OpenMeteoForecast>> {
    const points = games.map((g) => ({ team: g.home, ...STADIUMS[g.home]! }));
    const kickoffs = games.map((g) => new Date(g.kickoff).getTime());
    const results = await this.fetchForecast(
      points,
      utcDate(Math.min(...kickoffs)),
      utcDate(Math.max(...kickoffs) + GAME_WINDOW_HOURS * HOUR),
    );
    return new Map(games.map((g, i) => [g, results[i]!]));
  }

  /** Overridden by the mock client (../../mocks/weather-client.ts). */
  protected async fetchForecast(
    points: ForecastPoint[],
    startDate: string,
    endDate: string,
  ): Promise<OpenMeteoForecast[]> {
    const params = new URLSearchParams({
      latitude: points.map((p) => p.lat).join(','),
      longitude: points.map((p) => p.lon).join(','),
      hourly: HOURLY_FIELDS.join(','),
      wind_speed_unit: 'mph',
      temperature_unit: 'fahrenheit',
      precipitation_unit: 'inch',
      timezone: 'GMT',
      start_date: startDate,
      end_date: endDate,
    });
    const res = await fetch(`${this.baseUrl}?${params}`);
    if (!res.ok) throw new WeatherApiError(`Open-Meteo ${res.status}`, res.status);
    const body = (await res.json()) as OpenMeteoForecast | OpenMeteoForecast[];
    const results = Array.isArray(body) ? body : [body];
    if (results.length !== points.length) {
      throw new WeatherApiError(`Open-Meteo returned ${results.length} of ${points.length} locations`);
    }
    return results;
  }
}

/** By the nearest game not yet finished; an in-progress game counts as zero away. */
function ttlFor(games: NflGameVenue[], now: number): number {
  const nearest = Math.min(
    ...games
      .filter((g) => g.state !== 'post')
      .map((g) => Math.max(0, new Date(g.kickoff).getTime() - now)),
  );
  return TTL_TIERS.find((tier) => nearest <= tier.within)!.ttl;
}
