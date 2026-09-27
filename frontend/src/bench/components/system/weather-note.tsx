import type { GameConditions, GameWeather } from '@benchpoints/core';
import { cn } from '@bench/lib/utils';

const TONE = {
  notable: 'text-amber-700 dark:text-amber-400',
  harsh: 'text-destructive',
} as const;

const SOURCE = {
  forecast: 'Forecast via Open-Meteo, worst hour of the game window',
  espn: 'Posted conditions via ESPN',
  none: '',
} as const;

/** Everything the source reported, one reading per line — the hover behind the headline. */
function detail(c: GameConditions): string[] {
  return [
    c.condition,
    c.tempF !== null ? `${Math.round(c.tempF)}°F` : null,
    c.windMph !== null ? `Wind ${Math.round(c.windMph)} mph` : null,
    c.gustMph !== null ? `Gusts ${Math.round(c.gustMph)} mph` : null,
    c.precipChance !== null ? `${Math.round(c.precipChance)}% chance of precipitation` : null,
    c.snowIn ? `Snow ${c.snowIn.toFixed(2)} in/hr` : null,
    c.rainIn ? `Rain ${c.rainIn.toFixed(2)} in/hr` : null,
  ].filter((line): line is string => line !== null);
}

/**
 * A game's weather in a few words, colored by severity — or nothing at all, when it's calm
 * or under a roof. Silence is the common case, so the rows it does appear on stand out.
 */
export function WeatherNote({ weather, className }: { weather: GameWeather | undefined; className?: string }) {
  if (!weather || weather.severity === 'none') return null;
  const title = [
    `${weather.away} @ ${weather.home}${weather.venueName ? ` — ${weather.venueName}` : ''}`,
    ...(weather.conditions ? detail(weather.conditions) : []),
    SOURCE[weather.source],
  ]
    .filter(Boolean)
    .join('\n');
  return (
    <span className={cn('shrink-0 text-xs', TONE[weather.severity], className)} title={title}>
      {weather.notes.map((n) => n.label).join(' · ')}
    </span>
  );
}
