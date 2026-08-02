
import type { Platform } from '@benchpoints/core';
import { Link } from '@bench/lib/nav';
import { Skeleton } from '@bench/components/ui/skeleton';
import { PlatformBadge } from '@bench/components/system/platform-badge';
import { useLeagues, useLeagueSummaries } from '@bench/lib/queries';
import { FlagList } from './flag-list';
import { MatchupHeader } from './matchup-header';
import { RosterView } from './roster-view';

function ComingSoon({ title }: { title: string }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">{title}</h2>
      <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        Coming soon
      </p>
    </section>
  );
}

/**
 * Full waiver-wire browsing is still "Coming soon" (not built), but we already compute
 * WAIVER_PLAYER_HIGHER_PROJECTION bench-iq flags — surface those here instead of a bare stub.
 */
function WaiversPreview({ summary }: { summary: ReturnType<typeof useLeagueSummaries>[number] | undefined }) {
  const waiverFlags = summary?.benchIq?.flags.filter((f) => f.type === 'WAIVER_PLAYER_HIGHER_PROJECTION') ?? [];

  return (
    <section aria-label="Waivers">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Waivers</h2>
      {waiverFlags.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          No waiver pickups outproject a starter right now.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {waiverFlags.map((flag, i) => (
            <li
              key={i}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl bg-card p-2 text-center ring-1 ring-foreground/10"
              title={flag.message}
            >
              <span className="line-clamp-2 text-xs font-medium">{flag.playerName}</span>
              {flag.slot && <span className="text-[10px] text-muted-foreground">{flag.slot}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LeagueDetailView({ platform, leagueId }: { platform: Platform; leagueId: string }) {
  const { data, isPending, isError } = useLeagues();
  const league = data?.leagues.find(
    (l) => l.platform === platform && l.externalLeagueId === leagueId,
  );
  const summaries = useLeagueSummaries(league ? [league] : []);

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError || !league) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        League not found.{' '}
        <Link href="/" className="font-medium text-foreground underline underline-offset-4">
          Back to Command Deck
        </Link>
      </div>
    );
  }

  const summary = summaries[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Deck
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          {league.name}
          <PlatformBadge platform={league.platform} />
        </h1>
      </div>
      {summary && <MatchupHeader summary={summary} />}
      <FlagList league={league} />
      <section aria-label="Roster">
        <h2 className="mb-2 text-sm font-medium text-muted-foreground">Roster</h2>
        <RosterView league={league} />
      </section>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ComingSoon title="Standings" />
        <WaiversPreview summary={summary} />
        <ComingSoon title="Trades" />
      </div>
    </div>
  );
}
