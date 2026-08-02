
import { Link } from '@bench/lib/nav';
import { Badge } from '@bench/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@bench/components/ui/card';
import { Skeleton } from '@bench/components/ui/skeleton';
import { PlatformBadge } from '@bench/components/system/platform-badge';
import type { LeagueSummary } from '@bench/lib/queries';
import { formatRecord } from '@bench/lib/utils';

export function LeagueCard({ summary }: { summary: LeagueSummary }) {
  const { league, isLoading, isError, myTeam, opponent, myMatchup, opponentMatchup, benchIq } =
    summary;
  const criticalCount = benchIq?.flags.filter((f) => f.level === 'critical').length ?? 0;
  const warningCount = benchIq?.flags.filter((f) => f.level === 'warning').length ?? 0;

  return (
    <Link
      href={`/leagues/${league.platform}/${league.externalLeagueId}`}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card size="sm" className="glass h-full transition-all group-hover:ring-brand/40 group-hover:ring-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="truncate">{league.name}</span>
            <PlatformBadge platform={league.platform} />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isLoading ? (
            <>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16" />
            </>
          ) : isError ? (
            <p className="text-sm text-muted-foreground">Couldn&apos;t load this league.</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {myTeam ? (
                  <>
                    <span className="scoreboard font-semibold text-foreground">
                      {formatRecord(myTeam.wins, myTeam.losses, myTeam.ties)}
                    </span>{' '}
                    · {myTeam.displayName}
                  </>
                ) : (
                  'Team not found'
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {myMatchup && opponent ? (
                  <>
                    vs {opponent.displayName} ·{' '}
                    <span className="scoreboard font-semibold text-foreground">
                      {myMatchup.points.toFixed(1)} – {(opponentMatchup?.points ?? 0).toFixed(1)}
                    </span>
                  </>
                ) : (
                  `No matchup · Week ${league.currentWeek}`
                )}
              </p>
              <div className="flex gap-2">
                {criticalCount > 0 && <Badge variant="destructive">{criticalCount} critical</Badge>}
                {warningCount > 0 && <Badge variant="secondary">{warningCount} warning</Badge>}
                {criticalCount === 0 && warningCount === 0 && (
                  <Badge variant="outline" className="text-muted-foreground">
                    0 flags
                  </Badge>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
