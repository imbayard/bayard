
import { Skeleton } from '@bench/components/ui/skeleton';
import type { LeagueSummary } from '@bench/lib/queries';
import { cn } from '@bench/lib/utils';

function Side({
  name,
  points,
  projection,
  winning,
  align,
}: {
  name: string;
  points: number | null;
  projection: number | null;
  winning: boolean;
  align: 'left' | 'right';
}) {
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col', align === 'right' && 'items-end text-right')}>
      <span className="w-full truncate text-sm font-medium">{name}</span>
      <span
        className={cn(
          'text-2xl font-semibold tabular-nums',
          winning ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {points === null ? '—' : points.toFixed(1)}
      </span>
      {/* Same `proj` sub-line the deck card uses, so the two scoreboards read alike. */}
      {projection !== null && (
        <span className="text-xs text-muted-foreground tabular-nums">
          proj {projection.toFixed(1)}
        </span>
      )}
    </div>
  );
}

export function MatchupHeader({ summary }: { summary: LeagueSummary }) {
  const { league, isLoading, myTeam, opponent, myMatchup, opponentMatchup, benchIq } = summary;

  if (isLoading) {
    return <Skeleton className="h-24 rounded-xl" />;
  }

  const myPoints = myMatchup?.points ?? null;
  const oppPoints = opponentMatchup?.points ?? null;
  // bench-iq sums my starters' projection too — lean on it while the matchup side is still null.
  const myProjection = myMatchup?.projectedPoints ?? benchIq?.projectedPoints ?? null;
  const oppProjection = opponentMatchup?.projectedPoints ?? null;

  return (
    <section
      aria-label="Matchup"
      className="flex items-center gap-6 rounded-xl bg-card px-6 py-4 ring-1 ring-foreground/10"
    >
      {myMatchup && opponent ? (
        <>
          <Side
            name={myTeam?.displayName ?? 'Your team'}
            points={myPoints}
            projection={myProjection}
            winning={(myPoints ?? 0) >= (oppPoints ?? 0)}
            align="left"
          />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            WEEK {league.currentWeek}
          </span>
          <Side
            name={opponent.displayName}
            points={oppPoints}
            projection={oppProjection}
            winning={(oppPoints ?? 0) >= (myPoints ?? 0)}
            align="right"
          />
        </>
      ) : (
        <>
          <Side
            name={myTeam?.displayName ?? 'Your team'}
            points={myPoints}
            projection={myProjection}
            winning
            align="left"
          />
          <span className="shrink-0 text-sm text-muted-foreground">
            No matchup · Week {league.currentWeek}
          </span>
        </>
      )}
    </section>
  );
}
