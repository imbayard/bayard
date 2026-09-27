/** Whether a stadium can keep the weather out. A retractable roof closes when it matters. */
export type RoofType = 'open' | 'dome' | 'retractable';

/** One game of a week's slate with its venue — the raw material a weather read is built on. */
export interface NflGameVenue {
  /** Normalized home team code. */
  home: string;
  /** Normalized away team code. */
  away: string;
  /** ISO 8601 kickoff. */
  kickoff: string;
  state: 'pre' | 'in' | 'post';
  /** True for international and other neutral-site games — the home team's stadium is elsewhere. */
  neutralSite: boolean;
  venueName: string | null;
  /** ESPN's own "is this indoors" read; null when the payload doesn't say. */
  indoor: boolean | null;
  /** ESPN's brief kickoff conditions (AccuWeather-sourced); null when not yet posted. */
  espnWeather: { tempF: number | null; condition: string | null } | null;
}

/**
 * What the game window looks like, worst hour of it. Every field is null when the source
 * doesn't report it — ESPN alone gives a temperature and a sentence, nothing more.
 */
export interface GameConditions {
  tempF: number | null;
  windMph: number | null;
  gustMph: number | null;
  /** Rain + showers, inches per hour. */
  rainIn: number | null;
  /** Snowfall, inches per hour. */
  snowIn: number | null;
  /** Chance of any precipitation, 0-100. */
  precipChance: number | null;
  /** Free-text conditions ("Light rain"), when the source gives one. */
  condition: string | null;
}

export type WeatherKind = 'wind' | 'gusts' | 'rain' | 'snow' | 'cold' | 'heat';

export type WeatherSeverity = 'none' | 'notable' | 'harsh';

/** One condition that cleared a threshold, already worded for display. */
export interface WeatherNote {
  kind: WeatherKind;
  severity: Exclude<WeatherSeverity, 'none'>;
  /** "Wind 22 mph" */
  label: string;
  /** Positions this condition costs points. */
  affects: string[];
}

/** One game's weather, assessed. Keyed by both teams' codes wherever it's served as a map. */
export interface GameWeather {
  home: string;
  away: string;
  kickoff: string;
  state: 'pre' | 'in' | 'post';
  venueName: string | null;
  roof: RoofType | 'unknown';
  /** Where `conditions` came from. 'none' — covered, too far out, or nothing reported. */
  source: 'forecast' | 'espn' | 'none';
  conditions: GameConditions | null;
  /** Worst severity across `notes`; always 'none' under a roof. */
  severity: WeatherSeverity;
  /** Only the conditions that cleared a threshold, worst first. */
  notes: WeatherNote[];
}
