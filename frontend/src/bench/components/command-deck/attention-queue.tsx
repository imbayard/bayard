
import type { BenchIqFlag, League } from '@benchpoints/core';
import { Link } from '@bench/lib/nav';
import { HiddenAlertsSection, type HiddenAlertEntry } from '@bench/components/hidden-alerts-section';
import { Badge } from '@bench/components/ui/badge';
import { Skeleton } from '@bench/components/ui/skeleton';
import { alertKey, isHideableAlert, useHiddenAlerts } from '@bench/lib/hidden-alerts';
import { useLeagueSummaries } from '@bench/lib/queries';

interface QueueGroup {
  league: League;
  type: BenchIqFlag['type'];
  flags: BenchIqFlag[];
}

/** Severity rank, lowest = most urgent. Critical (lineup-breaking) flags rank above advisory warning flags. */
const TYPE_RANK: Record<BenchIqFlag['type'], number> = {
  INCOMPLETE_LINEUP: 0,
  STARTING_INACTIVE: 1,
  BYE_WEEK_STARTER: 2,
  BENCH_PLAYER_HIGHER_PROJECTION: 3,
  WAIVER_PLAYER_HIGHER_PROJECTION: 4,
};

/** Collapses a group of same-type flags for one league into a single message. */
function summarizeGroup(type: BenchIqFlag['type'], flags: BenchIqFlag[]): string {
  if (flags.length === 1) {
    return flags[0]!.message;
  }
  const names = flags.map((f) => f.playerName).filter((n): n is string => Boolean(n));
  switch (type) {
    case 'INCOMPLETE_LINEUP':
      return `${flags.length} starter slots are unfilled`;
    case 'BYE_WEEK_STARTER':
      return `${flags.length} starters on bye this week: ${names.join(', ')}`;
    case 'STARTING_INACTIVE':
      return `${flags.length} starters are inactive: ${names.join(', ')}`;
    case 'BENCH_PLAYER_HIGHER_PROJECTION':
      return `${flags.length} bench players outproject their starter: ${names.join(', ')}`;
    case 'WAIVER_PLAYER_HIGHER_PROJECTION':
      return `${flags.length} waiver players outproject a starter: ${names.join(', ')}`;
  }
}

const CRITICAL_TYPES = new Set<BenchIqFlag['type']>([
  'INCOMPLETE_LINEUP',
  'STARTING_INACTIVE',
  'BYE_WEEK_STARTER',
]);

export function AttentionQueue({ leagues, isLoading }: { leagues: League[]; isLoading: boolean }) {
  const summaries = useLeagueSummaries(leagues);
  const pending = isLoading || summaries.some((s) => s.isLoading);
  const { hidden } = useHiddenAlerts();

  const groups: QueueGroup[] = summaries
    .flatMap((s) => {
      const byType = new Map<BenchIqFlag['type'], BenchIqFlag[]>();
      for (const flag of s.benchIq?.flags ?? []) {
        if (hidden.has(alertKey(s.league, flag))) continue;
        byType.set(flag.type, [...(byType.get(flag.type) ?? []), flag]);
      }
      return Array.from(byType.entries()).map(([type, flags]) => ({ league: s.league, type, flags }));
    })
    .sort(
      (a, b) => TYPE_RANK[a.type] - TYPE_RANK[b.type] || a.league.name.localeCompare(b.league.name),
    );

  const hiddenEntries: HiddenAlertEntry[] = summaries.flatMap((s) =>
    (s.benchIq?.flags ?? [])
      .filter((f) => isHideableAlert(f) && hidden.has(alertKey(s.league, f)))
      .map((f) => ({ key: alertKey(s.league, f), league: s.league, flag: f })),
  );

  return (
    <section aria-label="Attention queue">
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
        Attention
      </h2>
      {pending ? (
        <Skeleton className="h-12 rounded-xl" />
      ) : groups.length === 0 ? (
        <div className="glass flex items-center gap-3 rounded-xl px-4 py-3">
          <span className="size-2 rounded-full bg-emerald-500" />
          <p className="text-sm font-medium">
            You&apos;re clean — no flags across {leagues.length}{' '}
            {leagues.length === 1 ? 'league' : 'leagues'}.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-1.5">
          {groups.map(({ league, type, flags }) => (
            <li key={`${league.platform}:${league.externalLeagueId}:${type}`}>
              <Link
                href={`/leagues/${league.platform}/${league.externalLeagueId}`}
                className="glass flex items-center gap-3 rounded-xl px-4 py-2.5 transition-all outline-none hover:ring-brand/40 hover:ring-2 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Badge variant={CRITICAL_TYPES.has(type) ? 'destructive' : 'secondary'}>
                  {CRITICAL_TYPES.has(type) ? 'critical' : 'warning'}
                </Badge>
                {flags.length > 1 && <Badge variant="secondary">×{flags.length}</Badge>}
                <span className="min-w-0 flex-1 truncate text-sm">
                  <span className="font-medium">{league.name}</span>
                  <span className="text-muted-foreground"> · {summarizeGroup(type, flags)}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">Review →</span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      {!pending && <HiddenAlertsSection entries={hiddenEntries} />}
    </section>
  );
}
