
import type { League } from '@benchpoints/core';
import { Skeleton } from '@bench/components/ui/skeleton';
import { useLeagueSummaries } from '@bench/lib/queries';
import { LeagueCard } from './league-card';

export function LeagueCardGrid({ leagues, isLoading }: { leagues: League[]; isLoading: boolean }) {
  const summaries = useLeagueSummaries(leagues);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
    );
  }

  if (leagues.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        No leagues found. Check your platform connections.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {summaries.map((summary) => (
        <LeagueCard
          key={`${summary.league.platform}:${summary.league.externalLeagueId}`}
          summary={summary}
        />
      ))}
    </div>
  );
}
