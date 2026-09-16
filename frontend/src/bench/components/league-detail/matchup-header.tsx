
import { Skeleton } from '@bench/components/ui/skeleton';
import type { LeagueSummary } from '@bench/lib/queries';
import { cn } from '@bench/lib/utils';

/**
 * Before kickoff the live score is 0.0 for both sides and the projection is the only number that
 * knows anything, so it takes the headline and the live zero is dropped entirely. Once a starter
 * has played the two swap back: live points large, projection as the `proj` sub-line.
 */
function Side({
  name,
  points,
  projection,
  live,
  leading,
  align,
}: {
  name: string;
  points: number | null;
  projection: number | null;
  live: boolean;
  leading: boolean;
  align: 'left' | 'right';
}) {
  const value = live ? points : projection;
  return (
    <div className={cn('flex min-w-0 flex-1 flex-col', align === 'right' && 'items-end text-right')}>
      <span className="w-full truncate text-sm font-medium">{name}</span>
      <span
        className={cn(
          'text-2xl font-semibold tabular-nums',
          value === null && 'text-muted-foreground',
          // Pre-game the number hasn't happened yet — the italic wash is the whole signal.
          value !== null && !live && 'italic opacity-60',
          value !== null && live && (leading ? 'text-foreground' : 'text-muted-foreground'),
        )}
      >
        {value === null ? '—' : value.toFixed(1)}
      </span>
      {live ? (
        /* Same `proj` sub-line the deck card uses, so the two scoreboards read alike. */
        projection !== null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            proj {projection.toFixed(1)}
          </span>
        )
      ) : (
        <span className="text-xs font-medium text-muted-foreground">PROJECTED</span>
      )}
    </div>
  );
}

export function MatchupHeader({ summary }: { summary: LeagueSummary }) {
  const { league, isLoading, myTeam, opponent, myMatchup, opponentMatchup, benchIq } = summary;

  if (isLoading) {
    return <Skeleton className="h-24 rounded-xl" />;
  }

  // Same "is it live" test the deck card uses, so the card and this header never disagree.
  const live = Boolean(myMatchup?.anyStarterStarted || opponentMatchup?.anyStarterStarted);
  const myPoints = myMatchup?.points ?? null;
  const oppPoints = opponentMatchup?.points ?? null;
  // bench-iq sums my starters' projection too — lean on it while the matchup side is still null.
  const myProjection = myMatchup?.projectedPoints ?? benchIq?.projectedPoints ?? null;
  const oppProjection = opponentMatchup?.projectedPoints ?? null;
  // Whoever's ahead on the number actually being shown — points once live, projection before.
  const myValue = live ? myPoints : myProjection;
  const oppValue = live ? oppPoints : oppProjection;

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
            live={live}
            leading={(myValue ?? 0) >= (oppValue ?? 0)}
            align="left"
          />
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            WEEK {league.currentWeek}
          </span>
          <Side
            name={opponent.displayName}
            points={oppPoints}
            projection={oppProjection}
            live={live}
            leading={(oppValue ?? 0) >= (myValue ?? 0)}
            align="right"
          />
        </>
      ) : (
        <>
          <Side
            name={myTeam?.displayName ?? 'Your team'}
            points={myPoints}
            projection={myProjection}
            live={live}
            leading
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
