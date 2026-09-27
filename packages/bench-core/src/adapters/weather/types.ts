/** Raw Open-Meteo forecast shapes. Only the fields we request. */

/**
 * GET https://api.open-meteo.com/v1/forecast?latitude=a,b&longitude=c,d&hourly=...
 * Free, no key. Several comma-separated locations come back as an array, in request order;
 * a single location comes back as a bare object.
 */
export interface OpenMeteoForecast {
  hourly: {
    /** UTC hours ("2026-09-27T17:00") when requested with timezone=GMT. */
    time: string[];
    temperature_2m: (number | null)[];
    wind_speed_10m: (number | null)[];
    wind_gusts_10m: (number | null)[];
    rain: (number | null)[];
    showers: (number | null)[];
    snowfall: (number | null)[];
    precipitation_probability: (number | null)[];
  };
}

/** One stadium to forecast. `team` is the home team — unused by the API, keyed on by the mock. */
export interface ForecastPoint {
  team: string;
  lat: number;
  lon: number;
}
