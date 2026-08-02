
import type { League } from '@benchpoints/core';
import { Badge } from '@bench/components/ui/badge';
import { Skeleton } from '@bench/components/ui/skeleton';
import type { EnrichedRosterEntry } from '@bench/lib/api';
import { useBenchIq, useRosters } from '@bench/lib/queries';

const INJURY_TONE: Record<string, string> = {
  Questionable: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  Doubtful: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  Out: 'bg-destructive/10 text-destructive',
  IR: 'bg-destructive/10 text-destructive',
};

function PlayerRow({ entry, currentWeek }: { entry: EnrichedRosterEntry; currentWeek: number }) {
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
      <span className="w-9 shrink-0 text-xs font-medium text-muted-foreground">
        {player.position}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{player.fullName}</span>
      {player.injuryStatus && (
        <Badge
          variant="outline"
          className={INJURY_TONE[player.injuryStatus] ?? 'text-muted-foreground'}
        >
          {player.injuryStatus}
        </Badge>
      )}
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
}: {
  title: string;
  entries: EnrichedRosterEntry[];
  currentWeek: number;
}) {
  if (entries.length === 0) return null;
  return (
    <div>
      <h3 className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <ul className="divide-y divide-foreground/5">
        {entries.map((entry, i) => (
          <PlayerRow key={`${entry.externalPlayerId}:${i}`} entry={entry} currentWeek={currentWeek} />
        ))}
      </ul>
    </div>
  );
}

export function RosterView({ league }: { league: League }) {
  const benchIq = useBenchIq(league.platform, league.externalLeagueId);
  const rosters = useRosters(league.platform, league.externalLeagueId, league.season, league.currentWeek);

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
      <Group title="Starters" entries={starters} currentWeek={league.currentWeek} />
      <Group title="Bench" entries={bench} currentWeek={league.currentWeek} />
      <Group title="IR / Taxi" entries={reserve} currentWeek={league.currentWeek} />
    </section>
  );
}
