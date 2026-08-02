import { AttentionQueue } from '@bench/components/command-deck/attention-queue';
import { LeagueCardGrid } from '@bench/components/command-deck/league-card-grid';
import { PortfolioPulse } from '@bench/components/command-deck/portfolio-pulse';
import { MockToggle } from '@bench/components/system/mock-toggle';
import { useLeagues } from '@bench/lib/queries';

export function CommandDeck() {
  const { data, isPending, isError, error } = useLeagues();
  const leagues = data?.leagues ?? [];
  const currentWeek = leagues.length > 0 ? Math.max(...leagues.map((l) => l.currentWeek)) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        {currentWeek != null ? (
          <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            <span className="size-1.5 rounded-full bg-brand" />
            Week {currentWeek}
          </span>
        ) : (
          <span />
        )}
        <MockToggle />
      </div>
      {isError ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Couldn&apos;t reach the BenchPoints API. {error.message}
        </div>
      ) : (
        <>
          <PortfolioPulse leagues={leagues} isLoading={isPending} />
          <AttentionQueue leagues={leagues} isLoading={isPending} />
          <section aria-label="Leagues">
            <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Leagues
            </h2>
            <LeagueCardGrid leagues={leagues} isLoading={isPending} />
          </section>
        </>
      )}
    </div>
  );
}
