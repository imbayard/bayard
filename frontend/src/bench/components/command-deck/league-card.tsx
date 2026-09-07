
import { useState } from 'react';
import { differenceInMinutes, format, isValid, parseISO } from 'date-fns';
import { Link } from '@bench/lib/nav';
import { Badge } from '@bench/components/ui/badge';
import { Card } from '@bench/components/ui/card';
import { Skeleton } from '@bench/components/ui/skeleton';
import { PlatformBadge } from '@bench/components/system/platform-badge';
import { scheduleDraft } from '@bench/lib/api';
import { alertKey, useHiddenAlerts } from '@bench/lib/hidden-alerts';
import { useMockMode } from '@bench/lib/mock-mode';
import type { LeagueSummary } from '@bench/lib/queries';
import { cn, draftSlot } from '@bench/lib/utils';

type ScheduleStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Terse kickoff read: "Sun 1:00p" days out, a countdown once it's inside a day. */
function formatKickoff(iso: string): string | null {
  const date = parseISO(iso);
  if (!isValid(date)) return null;
  const mins = differenceInMinutes(date, new Date());
  if (mins >= 0 && mins < 24 * 60) {
    return mins < 60 ? `in ${mins}m` : `in ${Math.round(mins / 60)}h`;
  }
  return format(date, 'EEE h:mmaaaaa');
}

/**
 * When my week actually starts. Bench players usually kick off alongside the starters, so the
 * two timestamps collapse to one line in the common case and only split when someone on the
 * bench plays earlier than anyone I'm starting.
 */
function kickoffLine(firstStarter: string | null, firstPlayer: string | null): string | null {
  const starters = firstStarter ? formatKickoff(firstStarter) : null;
  const all = firstPlayer ? formatKickoff(firstPlayer) : null;
  if (!starters && !all) return null;
  if (!starters) return `All ${all}`;
  if (!all || starters === all) return `Kickoff ${starters}`;
  return `Starters ${starters} · All ${all}`;
}

function Side({
  name,
  points,
  projection,
  live,
  leading,
  children,
}: {
  name: string;
  points: number | null;
  projection: number | null;
  live: boolean;
  leading: boolean;
  children?: React.ReactNode;
}) {
  const value = live ? points : projection;
  return (
    <div className="flex min-w-0 flex-col gap-1 px-3 py-2.5">
      <span className="truncate text-xs text-muted-foreground">{name}</span>
      <span
        className={cn(
          'scoreboard text-3xl leading-none font-semibold tabular-nums',
          value === null && 'text-muted-foreground',
          // Pre-game the number hasn't happened yet — the italic wash is the whole signal.
          value !== null && !live && 'italic opacity-60',
          value !== null && live && (leading ? 'text-foreground' : 'text-muted-foreground'),
        )}
      >
        {value === null ? '—' : value.toFixed(1)}
      </span>
      {live && points !== null && (
        <span className="text-xs text-muted-foreground">
          proj {projection === null ? '—' : projection.toFixed(1)}
        </span>
      )}
      {children}
    </div>
  );
}

export function LeagueCard({ summary }: { summary: LeagueSummary }) {
  const { league, isLoading, isError, myTeam, opponent, myMatchup, opponentMatchup, benchIq } =
    summary;
  const [mock] = useMockMode();
  const { hidden } = useHiddenAlerts();
  const [scheduleStatus, setScheduleStatus] = useState<ScheduleStatus>('idle');

  // Flags the user has already dismissed shouldn't keep nagging from the card.
  const visibleFlagCount =
    benchIq?.flags.filter((f) => !hidden.has(alertKey(league, f))).length ?? 0;
  const slot = draftSlot(
    league.draftDate,
    league.draftStatus,
    benchIq?.rosterCount ?? 0,
    visibleFlagCount,
  );
  // Only an upcoming draft is worth putting on a calendar.
  const canSchedule = slot.kind === 'date' && league.draftDate !== null;

  const live = Boolean(myMatchup?.anyStarterStarted || opponentMatchup?.anyStarterStarted);
  const myPoints = myMatchup ? myMatchup.points : null;
  const oppPoints = opponentMatchup ? opponentMatchup.points : null;
  // bench-iq sums my starters' projection too — lean on it while the matchup side is still null.
  const myProjection = myMatchup?.projectedPoints ?? benchIq?.projectedPoints ?? null;
  const oppProjection = opponentMatchup?.projectedPoints ?? null;
  const kickoff = myMatchup
    ? kickoffLine(myMatchup.firstStarterKickoff, myMatchup.firstPlayerKickoff)
    : null;

  function handleScheduleDraft(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (scheduleStatus === 'saving') return;
    setScheduleStatus('saving');
    scheduleDraft(league.platform, league.externalLeagueId, mock)
      .then(() => {
        setScheduleStatus('saved');
        setTimeout(() => setScheduleStatus('idle'), 1500);
      })
      .catch(() => {
        setScheduleStatus('error');
        setTimeout(() => setScheduleStatus('idle'), 1500);
      });
  }

  return (
    <Link
      href={`/leagues/${league.platform}/${league.externalLeagueId}`}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* 20/80 split: the header is a label, the scoreboard is the point of the card. */}
      <Card
        size="sm"
        className="glass grid h-40 grid-rows-[1fr_4fr] gap-0 py-0 transition-all group-hover:ring-brand/40 group-hover:ring-2"
      >
        <div className="flex min-w-0 items-center gap-2 border-b border-border px-3">
          <span className="truncate font-heading text-sm font-medium">{league.name}</span>
          <PlatformBadge platform={league.platform} />
          {isLoading ? (
            <Skeleton className="ml-auto h-5 w-16 rounded-4xl" />
          ) : (
            <Badge
              variant={
                scheduleStatus === 'error' || slot.tone === 'alert' ? 'destructive' : 'outline'
              }
              className={cn(
                'ml-auto',
                scheduleStatus !== 'error' && slot.tone === 'notice' && 'border-brand text-brand',
                scheduleStatus !== 'error' && slot.tone === 'info' && 'border-info text-info',
                scheduleStatus !== 'error' && slot.tone === 'quiet' && 'text-muted-foreground',
                canSchedule && 'cursor-pointer hover:bg-info/10',
              )}
              onClick={canSchedule ? handleScheduleDraft : undefined}
              title={canSchedule ? 'Schedule draft to calendar' : undefined}
            >
              {scheduleStatus === 'saving'
                ? 'Scheduling…'
                : scheduleStatus === 'saved'
                  ? 'Added'
                  : scheduleStatus === 'error'
                    ? 'Failed'
                    : slot.label}
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 divide-x divide-border">
            {[0, 1].map((i) => (
              <div key={i} className="flex flex-col gap-2 px-3 py-2.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex items-center px-3 text-sm text-muted-foreground">
            Couldn&apos;t load this league.
          </div>
        ) : (
          <div className="grid grid-cols-2 divide-x divide-border">
            <Side
              name={myTeam?.displayName ?? 'Your team'}
              points={myPoints}
              projection={myProjection}
              live={live}
              leading={(myPoints ?? 0) >= (oppPoints ?? 0)}
            >
              {/* My players only, so it sits on my side rather than spanning the split. */}
              {!live && kickoff && (
                <span className="mt-auto truncate text-[11px] text-muted-foreground">
                  {kickoff}
                </span>
              )}
            </Side>
            <Side
              name={
                opponent
                  ? opponent.displayName
                  : myMatchup
                    ? 'Bye'
                    : `No matchup · Wk ${league.currentWeek}`
              }
              points={opponent ? oppPoints : null}
              projection={opponent ? oppProjection : null}
              live={live}
              leading={(oppPoints ?? 0) >= (myPoints ?? 0)}
            />
          </div>
        )}
      </Card>
    </Link>
  );
}
