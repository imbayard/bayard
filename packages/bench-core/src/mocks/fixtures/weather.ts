/**
 * Raw Open-Meteo fixture: one flat hourly profile per home team, repeated across whatever
 * window is asked for. Tuned against the Dynasty Dumpster Fire slate (every game pre-kickoff)
 * so mock mode shows each severity:
 *  - HOU @ GB — harsh wind and snow: WEATHER_RISK on that league's HOU WR and GB TE
 *  - CLE @ TB — notable rain: a roster note on the TB kicker, no flag
 *  - NO @ SEA — notable wind: a roster note, but the NO RB it touches isn't wind-sensitive
 *  - MIN @ LAC — dome: nothing at all
 */
import type { ForecastPoint, OpenMeteoForecast } from '../../adapters/weather/types.js';

interface Profile {
  temp: number;
  wind: number;
  gust: number;
  rain: number;
  snow: number;
  chance: number;
}

const CALM: Profile = { temp: 68, wind: 6, gust: 12, rain: 0, snow: 0, chance: 5 };

const PROFILES: Record<string, Profile> = {
  GB: { temp: 27, wind: 24, gust: 38, rain: 0, snow: 0.4, chance: 90 },
  TB: { temp: 78, wind: 9, gust: 18, rain: 0.06, snow: 0, chance: 70 },
  SEA: { temp: 55, wind: 15, gust: 24, rain: 0, snow: 0, chance: 20 },
};

export function openMeteoForecast(points: ForecastPoint[], startDate: string, endDate: string): OpenMeteoForecast[] {
  const time: string[] = [];
  for (let t = Date.parse(`${startDate}T00:00Z`); t <= Date.parse(`${endDate}T23:00Z`); t += 3_600_000) {
    time.push(new Date(t).toISOString().slice(0, 16));
  }
  return points.map(({ team }) => {
    const p = PROFILES[team] ?? CALM;
    const fill = (v: number) => time.map(() => v);
    return {
      hourly: {
        time,
        temperature_2m: fill(p.temp),
        wind_speed_10m: fill(p.wind),
        wind_gusts_10m: fill(p.gust),
        rain: fill(p.rain),
        showers: fill(0),
        snowfall: fill(p.snow),
        precipitation_probability: fill(p.chance),
      },
    };
  });
}
