
import type { GameWeather, League } from '@benchpoints/core';
import { normalizeTeamCode } from '@benchpoints/core/team-codes';
import { Badge } from '@bench/components/ui/badge';
import { PositionTag } from '@bench/components/system/position-tag';
import { WeatherNote } from '@bench/components/system/weather-note';
import { Skeleton } from '@bench/components/ui/skeleton';
import type { EnrichedRosterEntry } from '@bench/lib/api';
import { useBenchIq, useRosters, useWeather } from '@bench/lib/queries';

/** Team code -> that week's game weather. Empty while loading or if it failed — rows just go without. */
type WeatherByTeam = Record<string, GameWeather>;

const INJURY_TONE: Record<string, string> = {
  Questionable: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  Doubtful: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  Out: 'bg-destructive/10 text-destructive',
  IR: 'bg-destructive/10 text-destructive',
};

function PlayerRow({
  entry,
  currentWeek,
  weather,
}: {
  entry: EnrichedRosterEntry;
  currentWeek: number;
  weather: WeatherByTeam;
}) {
  const { player } = entry;
  if (!player) {
    return (
      <li className="flex items-center gap-3 px-4 py-2 text-sm text-muted-foreground">
        Unknown player ({entry.externalPlayerId})
      </li>
    );
  }
  const onBye = player.byeWeek !== null && player.byeWeek === currentWeek;
  return (
    <li className="flex items-center gap-3 px-4 py-2">
      <span className="w-12 shrink-0 text-right text-base font-bold tabular-nums">
        {player.projectedPoints !== null ? player.projectedPoints.toFixed(1) : '—'}
      </span>
      <PositionTag position={player.position} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{player.fullName}</span>
      {player.injuryStatus && (
        <Badge
          variant="outline"
          className={INJURY_TONE[player.injuryStatus] ?? 'text-muted-foreground'}
        >
          {player.injuryStatus}
        </Badge>
      )}
      {player.nflTeam && <WeatherNote weather={weather[normalizeTeamCode(player.nflTeam)]} />}
      <span
        className={
          player.nflTeam
            ? 'shrink-0 text-xs text-muted-foreground'
            : 'shrink-0 text-xs font-medium text-destructive'
        }
        title={player.nflTeam ? undefined : 'Player is a free agent'}
      >
        {player.nflTeam ?? 'FA'}
      </span>
      {onBye && (
        <Badge variant="outline" className="text-muted-foreground">
          BYE
        </Badge>
      )}
    </li>
  );
}

function Group({
  title,
  entries,
  currentWeek,
  weather,
}: {
  title: string;
  entries: EnrichedRosterEntry[];
  currentWeek: number;
  weather: WeatherByTeam;
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <h3 className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="divide-y divide-foreground/5">
        {entries.map((entry, i) => (
          <PlayerRow
            key={`${entry.externalPlayerId}:${i}`}
            entry={entry}
            currentWeek={currentWeek}
            weather={weather}
          />
        ))}
      </ul>
    </div>
  );
}

export function RosterView({ league }: { league: League }) {
  const benchIq = useBenchIq(league.platform, league.externalLeagueId);
  const rosters = useRosters(league.platform, league.externalLeagueId, league.season, league.currentWeek);
  // Deliberately not in the loading gate below: the roster shouldn't wait on the sky.
  const weather = useWeather(league.season, league.currentWeek).data ?? {};

  if (benchIq.isPending || rosters.isPending) {
    return <Skeleton className="h-64 rounded-xl" />;
  }
  if (benchIq.isError || rosters.isError) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Couldn&apos;t load your roster.
      </p>
    );
  }

  const roster = rosters.data.find((r) => r.externalTeamId === benchIq.data.teamId);
  if (!roster) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Your roster wasn&apos;t found in this league.
      </p>
    );
  }

  const starters = roster.entries.filter((e) => e.slot === 'starter');
  const bench = roster.entries.filter((e) => e.slot === 'bench');
  const reserve = roster.entries.filter((e) => e.slot === 'ir' || e.slot === 'taxi');

  return (
    <section aria-label="Roster" className="rounded-xl bg-card pb-2 ring-1 ring-foreground/10">
      <Group title="Starters" weather={weather} entries={starters} currentWeek={league.currentWeek} />
      <Group title="Bench" weather={weather} entries={bench} currentWeek={league.currentWeek} />
      <Group title="IR / Taxi" weather={weather} entries={reserve} currentWeek={league.currentWeek} />
    </section>
  );
}
