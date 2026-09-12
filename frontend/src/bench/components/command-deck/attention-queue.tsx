
import type { BenchIqFlag, League } from '@benchpoints/core';
import { Link } from '@bench/lib/nav';
import { HiddenAlertsSection, type HiddenAlertEntry } from '@bench/components/hidden-alerts-section';
import { DeltaCell, SwapLine } from '@bench/components/flag-row';
import { Badge } from '@bench/components/ui/badge';
import { Skeleton } from '@bench/components/ui/skeleton';
import { alertKey, isHideableAlert, useHiddenAlerts } from '@bench/lib/hidden-alerts';
import { useLeagueSummaries } from '@bench/lib/queries';
import { cn, railTone } from '@bench/lib/utils';

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

const CRITICAL_TYPES = new Set<BenchIqFlag['type']>([
  'INCOMPLETE_LINEUP',
  'STARTING_INACTIVE',
  'BYE_WEEK_STARTER',
]);

/** Order-preserving dedupe — core can surface the same player from two eligible slots. */
function uniq(values: (string | null)[]): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v))));
}

/** Total projection edge on offer in a group; null for types that aren't a comparison. */
function groupDelta(flags: BenchIqFlag[]): number | null {
  const deltas = flags.map((f) => f.delta).filter((d): d is number => d !== null);
  return deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) : null;
}

/** Collapses a group of same-type flags for one league into a single line. */
function summarizeGroup(type: BenchIqFlag['type'], flags: BenchIqFlag[]): string {
  const names = uniq(flags.map((f) => f.playerName));
  const list = names.join(', ');
  const verb = names.length === 1 ? 'outprojects' : 'outproject';
  switch (type) {
    case 'INCOMPLETE_LINEUP':
      return `${flags.length} starter slots unfilled`;
    case 'BYE_WEEK_STARTER':
      return `On bye: ${list}`;
    case 'STARTING_INACTIVE':
      return `Inactive: ${list}`;
    case 'BENCH_PLAYER_HIGHER_PROJECTION':
      return `${list} ${verb} your starters`;
    case 'WAIVER_PLAYER_HIGHER_PROJECTION':
      return `${list} on waivers ${verb} your starters`;
  }
}

/** A single flag shows the swap; a collapsed group needs the sentence. */
function GroupLine({ type, flags }: { type: BenchIqFlag['type']; flags: BenchIqFlag[] }) {
  return flags.length === 1 ? <SwapLine flag={flags[0]!} /> : <>{summarizeGroup(type, flags)}</>;
}

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
    // Severity still wins, but inside a tier the biggest swing goes to the top — that's the
    // only reason to read the list in order.
    .sort(
      (a, b) =>
        TYPE_RANK[a.type] - TYPE_RANK[b.type] ||
        (groupDelta(b.flags) ?? 0) - (groupDelta(a.flags) ?? 0) ||
        a.league.name.localeCompare(b.league.name),
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
          {groups.map(({ league, type, flags }) => {
            const critical = CRITICAL_TYPES.has(type);
            const delta = groupDelta(flags);
            const slots = uniq(flags.map((f) => f.slot)).join(', ');
            return (
              <li key={`${league.platform}:${league.externalLeagueId}:${type}`}>
                <Link
                  href={`/leagues/${league.platform}/${league.externalLeagueId}`}
                  title={uniq(flags.map((f) => f.message)).join('\n')}
                  className={cn(
                    'glass flex items-center gap-3 rounded-xl border-l-2 px-4 py-2.5 transition-all outline-none hover:ring-brand/40 hover:ring-2 focus-visible:ring-2 focus-visible:ring-ring',
                    railTone(critical ? 'critical' : 'warning'),
                  )}
                >
                  {critical && <Badge variant="destructive">critical</Badge>}
                  {flags.length > 1 && <Badge variant="secondary">×{flags.length}</Badge>}
                  <span className="max-w-40 shrink-0 truncate text-sm font-medium">
                    {league.name}
                  </span>
                  {slots && (
                    <span className="shrink-0 text-xs tracking-wider text-muted-foreground uppercase">
                      {slots}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                    <GroupLine type={type} flags={flags} />
                  </span>
                  {delta !== null && <DeltaCell value={delta} />}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      {!pending && <HiddenAlertsSection entries={hiddenEntries} />}
    </section>
  );
}
