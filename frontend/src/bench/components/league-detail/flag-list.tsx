
import type { League } from '@benchpoints/core';
import { EyeOff } from 'lucide-react';
import { DeltaCell, SwapLine } from '@bench/components/flag-row';
import { HiddenAlertsSection, type HiddenAlertEntry } from '@bench/components/hidden-alerts-section';
import { Badge } from '@bench/components/ui/badge';
import { Skeleton } from '@bench/components/ui/skeleton';
import { alertKey, isHideableAlert, useHiddenAlerts } from '@bench/lib/hidden-alerts';
import { useBenchIq } from '@bench/lib/queries';
import { cn, railTone } from '@bench/lib/utils';

export function FlagList({ league }: { league: League }) {
  const { data, isPending, isError } = useBenchIq(league.platform, league.externalLeagueId);
  const { hidden, hide } = useHiddenAlerts();

  // Criticals first, then the biggest projection edge — same order the command deck uses.
  const visibleFlags = (data?.flags.filter((f) => !hidden.has(alertKey(league, f))) ?? [])
    .slice()
    .sort(
      (a, b) =>
        Number(b.level === 'critical') - Number(a.level === 'critical') ||
        (b.delta ?? 0) - (a.delta ?? 0),
    );
  const hiddenEntries: HiddenAlertEntry[] =
    data?.flags
      .filter((f) => hidden.has(alertKey(league, f)))
      .map((f) => ({ key: alertKey(league, f), league, flag: f })) ?? [];

  return (
    <section aria-label="Flags">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Flags</h2>
      {isPending ? (
        <Skeleton className="h-12 rounded-xl" />
      ) : isError ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Couldn&apos;t compute flags for this league.
        </p>
      ) : visibleFlags.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl bg-emerald-500/10 px-4 py-3 ring-1 ring-emerald-500/20">
          <span className="size-2 rounded-full bg-emerald-500" />
          <p className="text-sm font-medium">Lineup is clean for week {data.week}.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {visibleFlags.map((flag, i) => (
            <li
              key={`${alertKey(league, flag)}:${i}`}
              title={flag.message}
              className={cn(
                'flex items-center gap-3 rounded-xl border-l-2 bg-card px-4 py-2.5 ring-1 ring-foreground/10',
                railTone(flag.level),
              )}
            >
              {flag.level === 'critical' && <Badge variant="destructive">critical</Badge>}
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                <SwapLine flag={flag} />
              </span>
              {flag.slot && (
                <span className="shrink-0 text-xs tracking-wider text-muted-foreground uppercase">
                  {flag.slot}
                </span>
              )}
              {flag.delta !== null && <DeltaCell value={flag.delta} />}
              {isHideableAlert(flag) && (
                <button
                  type="button"
                  onClick={() => hide(alertKey(league, flag))}
                  title="Hide this alert"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <EyeOff className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!isPending && !isError && <HiddenAlertsSection entries={hiddenEntries} />}
    </section>
  );
}
