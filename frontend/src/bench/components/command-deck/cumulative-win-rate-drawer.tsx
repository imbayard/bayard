import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { League, Matchup } from '@benchpoints/core';
// Subpath, not the package root: the root barrel pulls in the nflverse client and its
// node:zlib import, which Vite can't bundle for the browser.
import { matchupResult } from '@benchpoints/core/compute/results';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Skeleton } from '@bench/components/ui/skeleton';
import { matchupsQuery, type LeagueSummary } from '@bench/lib/queries';
import { useMockMode } from '@bench/lib/mock-mode';

interface WeekPoint {
  week: number;
  pct: number | null;
  wins: number;
  losses: number;
  ties: number;
}

// Status, not identity — reuses the app's existing good/warn tokens (railTone in
// lib/utils.ts makes the same amber-500 call for its own warn level).
const GOOD_FILL = 'var(--color-positive)';
const WARN_FILL = '#f59e0b';

/**
 * One win/loss/tie tally across every league's "my team" row, cumulative through each
 * week. A league that hasn't reached a given week yet (or has no resolved myTeam)
 * simply contributes nothing that week — its record carries forward untouched.
 */
function buildCumulative(
  leagues: League[],
  myTeamIds: (string | null)[],
  matchupsByKey: Map<string, Matchup[] | undefined>,
  maxWeeks: number,
): WeekPoint[] {
  let wins = 0;
  let losses = 0;
  let ties = 0;
  const points: WeekPoint[] = [];

  for (let week = 1; week <= maxWeeks; week++) {
    leagues.forEach((league, i) => {
      if (week > league.currentWeek - 1) return;
      const myTeamId = myTeamIds[i];
      if (!myTeamId) return;
      const weekMatchups = matchupsByKey.get(`${i}:${week}`);
      if (!weekMatchups) return;
      const result = matchupResult(weekMatchups, myTeamId);
      if (result === 'win') wins += 1;
      else if (result === 'loss') losses += 1;
      else if (result === 'tie') ties += 1;
    });

    const total = wins + losses + ties;
    points.push({
      week,
      pct: total > 0 ? ((wins + ties * 0.5) / total) * 100 : null,
      wins,
      losses,
      ties,
    });
  }

  return points;
}

function DrawerTooltip({ active, payload }: { active?: boolean; payload?: { payload: WeekPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  if (p.pct == null) return null;

  return (
    <div className="min-w-32 rounded-xl bg-card p-3 text-xs ring-1 ring-foreground/10">
      <div className="mb-1 font-medium text-muted-foreground">Week {p.week}</div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="tabular-nums text-lg font-semibold text-foreground">{p.pct.toFixed(0)}%</span>
        <span className="tabular-nums text-muted-foreground">
          {p.wins}-{p.losses}
          {p.ties > 0 ? `-${p.ties}` : ''}
        </span>
      </div>
    </div>
  );
}

export function CumulativeWinRateDrawer({
  leagues,
  summaries,
  open,
}: {
  leagues: League[];
  summaries: LeagueSummary[];
  open: boolean;
}) {
  const [mock] = useMockMode();
  const maxWeeks = leagues.length > 0 ? Math.max(0, ...leagues.map((l) => l.currentWeek - 1)) : 0;
  const myTeamIds = summaries.map((s) => s.myTeam?.externalTeamId ?? null);

  const weekQueries = useMemo(
    () =>
      leagues.flatMap((league, i) =>
        Array.from({ length: Math.max(0, league.currentWeek - 1) }, (_, w) => w + 1).map((week) => ({
          i,
          week,
          query: matchupsQuery(league.platform, league.externalLeagueId, league.season, week, mock),
        })),
      ),
    [leagues, mock],
  );

  const results = useQueries({
    queries: weekQueries.map(({ query }) => ({ ...query, enabled: open })),
  });

  const isLoading = open && results.some((r) => r.isPending);
  const points = useMemo(() => {
    const byKey = new Map<string, Matchup[] | undefined>();
    weekQueries.forEach(({ i, week }, idx) => byKey.set(`${i}:${week}`, results[idx]?.data));
    return buildCumulative(leagues, myTeamIds, byKey, maxWeeks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekQueries, results, leagues, maxWeeks]);

  if (!open) return null;

  if (maxWeeks === 0) {
    return (
      <p className="mt-3 rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
        No completed weeks yet.
      </p>
    );
  }

  if (isLoading) {
    return <Skeleton className="mt-3 h-48 rounded-xl" />;
  }

  return (
    <div className="mt-3 rounded-xl bg-card p-3 ring-1 ring-foreground/10">
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--color-border)" />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={{ stroke: '#fff' }}
              tick={{ fontSize: 10, fill: '#fff' }}
              tickFormatter={(w: number) => `W${w}`}
            />
            <YAxis
              domain={[0, 100]}
              ticks={[0, 25, 50, 75, 100]}
              tickFormatter={(v: number) => `${v}%`}
              tickLine={false}
              axisLine={{ stroke: '#fff' }}
              width={40}
              tick={{ fontSize: 10, fill: '#fff' }}
            />
            {/* cursor={false}: hover shows the tooltip only — no highlight fill behind the bar. */}
            <Tooltip content={<DrawerTooltip />} cursor={false} />
            <Bar dataKey="pct" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false}>
              {points.map((p) => (
                <Cell key={p.week} fill={p.pct != null && p.pct >= 50 ? GOOD_FILL : WARN_FILL} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
