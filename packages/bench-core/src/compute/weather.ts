import { normalizeTeamCode } from '../adapters/nflverse/team-codes.js';
import type { Player, Roster } from '../types/league.js';
import type {
  GameConditions,
  GameWeather,
  WeatherKind,
  WeatherNote,
  WeatherSeverity,
} from '../types/weather.js';

const PASSING = ['QB', 'WR', 'TE', 'K'];

interface WeatherRule {
  kind: WeatherKind;
  read: (c: GameConditions) => number | null;
  /** Which way is bad: wind is worse the higher it goes, cold the lower. */
  worse: 'above' | 'below';
  notable: number;
  /** Null when this condition is never bad enough to act on — worth knowing, not worth a flag. */
  harsh: number | null;
  label: (value: number, severity: Exclude<WeatherSeverity, 'none'>) => string;
  affects: string[];
}

/**
 * The whole definition of "bad weather", in one table. Every consumer — the flag, the roster
 * note, the scout cell, the email — reads its severity from here, so moving a threshold moves
 * it everywhere at once.
 *
 * Wind is the one that reliably costs points: the passing game and kickers fall off past
 * ~15 mph sustained, and a breezy 12 is just September. Precipitation is per hour over the
 * game window, so an inch spread over a day doesn't read as a downpour.
 */
export const WEATHER_RULES: WeatherRule[] = [
  {
    kind: 'wind',
    read: (c) => c.windMph,
    worse: 'above',
    notable: 15,
    harsh: 20,
    label: (v) => `Wind ${Math.round(v)} mph`,
    affects: PASSING,
  },
  {
    kind: 'gusts',
    read: (c) => c.gustMph,
    worse: 'above',
    notable: 30,
    harsh: 40,
    label: (v) => `Gusts ${Math.round(v)} mph`,
    affects: PASSING,
  },
  {
    kind: 'snow',
    read: (c) => c.snowIn,
    worse: 'above',
    notable: 0.05,
    harsh: 0.3,
    label: (_, s) => (s === 'harsh' ? 'Heavy snow' : 'Snow'),
    affects: [...PASSING, 'RB'],
  },
  {
    kind: 'rain',
    read: (c) => c.rainIn,
    worse: 'above',
    notable: 0.03,
    harsh: 0.15,
    label: (_, s) => (s === 'harsh' ? 'Heavy rain' : 'Rain'),
    affects: PASSING,
  },
  {
    kind: 'cold',
    read: (c) => c.tempF,
    worse: 'below',
    notable: 32,
    harsh: 15,
    label: (v) => `${Math.round(v)}°F`,
    affects: ['QB', 'K'],
  },
  {
    kind: 'heat',
    read: (c) => c.tempF,
    worse: 'above',
    notable: 92,
    harsh: null,
    label: (v) => `${Math.round(v)}°F`,
    affects: [],
  },
];

/**
 * When a source only gives a sentence (ESPN's "Light rain"), read it as a reading. Applied
 * only to kinds the numbers didn't cover — a forecast's measured rain beats a word. First
 * match per kind wins, so the heavier phrasing goes first.
 */
const CONDITION_PHRASES: { pattern: RegExp; kind: WeatherKind; severity: Exclude<WeatherSeverity, 'none'> }[] = [
  { pattern: /heavy snow|blizzard/i, kind: 'snow', severity: 'harsh' },
  { pattern: /snow|flurr|sleet/i, kind: 'snow', severity: 'notable' },
  { pattern: /heavy rain|thunder|t-storm/i, kind: 'rain', severity: 'harsh' },
  { pattern: /rain|shower|drizzle/i, kind: 'rain', severity: 'notable' },
  { pattern: /wind/i, kind: 'wind', severity: 'notable' },
];

const SEVERITY_RANK: Record<WeatherSeverity, number> = { none: 0, notable: 1, harsh: 2 };

function worstOf(a: WeatherSeverity, b: WeatherSeverity): WeatherSeverity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

function clears(value: number, threshold: number, worse: 'above' | 'below'): boolean {
  return worse === 'above' ? value >= threshold : value <= threshold;
}

/** Conditions in, the ones worth saying out loud back — worst first, with the game's overall read. */
export function assessConditions(conditions: GameConditions | null): {
  severity: WeatherSeverity;
  notes: WeatherNote[];
} {
  if (!conditions) return { severity: 'none', notes: [] };

  const notes: WeatherNote[] = [];
  const measured = new Set<WeatherKind>();
  for (const rule of WEATHER_RULES) {
    const value = rule.read(conditions);
    if (value === null) continue;
    measured.add(rule.kind);
    const severity =
      rule.harsh !== null && clears(value, rule.harsh, rule.worse)
        ? 'harsh'
        : clears(value, rule.notable, rule.worse)
          ? 'notable'
          : null;
    if (severity) {
      notes.push({ kind: rule.kind, severity, label: rule.label(value, severity), affects: rule.affects });
    }
  }

  if (conditions.condition) {
    for (const phrase of CONDITION_PHRASES) {
      if (measured.has(phrase.kind) || !phrase.pattern.test(conditions.condition)) continue;
      measured.add(phrase.kind);
      const rule = WEATHER_RULES.find((r) => r.kind === phrase.kind);
      notes.push({
        kind: phrase.kind,
        severity: phrase.severity,
        label: conditions.condition,
        affects: rule?.affects ?? [],
      });
    }
  }

  notes.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const severity = notes.reduce<WeatherSeverity>((worst, n) => worstOf(worst, n.severity), 'none');
  return { severity, notes };
}

/** "Wind 22 mph · Heavy snow" — the one-line read every surface shows. Null when nothing's notable. */
export function weatherSummary(weather: GameWeather | undefined): string | null {
  if (!weather || weather.notes.length === 0) return null;
  return weather.notes.map((n) => n.label).join(' · ');
}

/** One starter in a game with notable-or-worse weather that actually touches their position. */
export interface WeatherExposure {
  playerId: string;
  playerName: string;
  position: string;
  weather: GameWeather;
  /** Just the notes that affect this player's position. */
  notes: WeatherNote[];
  severity: Exclude<WeatherSeverity, 'none'>;
}

/**
 * Which starters the weather reaches. Only games still to kick off — once a game is underway
 * there's no lineup decision left to make. Shared by the flag (harsh only) and the email
 * (notable and up), so both agree on who's exposed.
 */
export function weatherExposure(
  roster: Roster,
  players: Map<string, Player>,
  weather: Map<string, GameWeather>,
): WeatherExposure[] {
  const exposures: WeatherExposure[] = [];
  for (const entry of roster.entries) {
    if (entry.slot !== 'starter') continue;
    const player = players.get(entry.externalPlayerId);
    if (!player?.nflTeam) continue;
    const game = weather.get(normalizeTeamCode(player.nflTeam));
    if (!game || game.state !== 'pre' || game.severity === 'none') continue;
    const notes = game.notes.filter((n) => n.affects.includes(player.position));
    if (notes.length === 0) continue;
    exposures.push({
      playerId: player.externalPlayerId,
      playerName: player.fullName,
      position: player.position,
      weather: game,
      notes,
      severity: notes.some((n) => n.severity === 'harsh') ? 'harsh' : 'notable',
    });
  }
  return exposures;
}
