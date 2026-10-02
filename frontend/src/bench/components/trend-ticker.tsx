import { useState, type CSSProperties } from 'react';
import type { BenchIqTrend, League } from '@benchpoints/core';
import { trendsByPlayer } from '@benchpoints/core/compute/trends/usage-trend';
import { Link } from '@bench/lib/nav';
import { useLeagueSummaries } from '@bench/lib/queries';
import { cn } from '@bench/lib/utils';

/** One player's move, with every league they're rostered in — the same move, not five. */
interface TrendEntry {
  leagues: League[];
  trend: BenchIqTrend;
}

function leagueLabel(leagues: League[]): string {
  return leagues.length === 1 ? leagues[0]!.name : `${leagues.length} leagues`;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Arrow({ trend }: { trend: BenchIqTrend }) {
  const up = trend.recent > trend.baseline;
  return (
    <span className={cn('text-[10px]', up ? 'text-emerald-500' : 'text-rose-500')} aria-label={up ? 'up' : 'down'}>
      {up ? '▲' : '▼'}
    </span>
  );
}

/** One ticker item: who, what moved, and where it was. */
function TapeItem({ leagues, trend, showLeague }: TrendEntry & { showLeague: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-sm whitespace-nowrap">
      <Arrow trend={trend} />
      <span className="font-medium">{trend.playerName}</span>
      <span className="text-muted-foreground">
        {trend.metric} <span className="scoreboard text-foreground">{pct(trend.recent)}</span> from{' '}
        <span className="scoreboard">{pct(trend.baseline)}</span>
        {showLeague && <> &middot; {leagueLabel(leagues)}</>}
      </span>
    </span>
  );
}

/**
 * Usage trends, kept out of the attention queue: they're "heads up", not "make a move".
 * The tape carries only the big moves; tapping it unrolls every trend underneath.
 */
export function TrendTicker({ leagues }: { leagues: League[] }) {
  const summaries = useLeagueSummaries(leagues);
  const [open, setOpen] = useState(false);

  const entries = trendsByPlayer(
    summaries.flatMap((s) => (s.benchIq?.trends ?? []).map((trend) => ({ league: s.league, trend }))),
  );
  // Heads-ups only: no skeleton while loading, no empty state when nothing moved.
  if (entries.length === 0) return null;

  const major = entries.filter((e) => e.trend.major);
  const showLeague = leagues.length > 1;
  // Roughly constant reading speed however many items are on the tape.
  const duration: CSSProperties = { ['--ticker-duration' as string]: `${Math.max(20, major.length * 8)}s` };

  return (
    <section aria-label="Trends">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="ticker glass flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-all outline-none hover:ring-2 hover:ring-brand/40 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="shrink-0 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Trends
        </span>
        <span className="flex min-w-0 flex-1 overflow-hidden">
          {major.length === 0 ? (
            <span className="truncate text-sm text-muted-foreground">
              {entries.length} smaller {entries.length === 1 ? 'move' : 'moves'} in usage — tap for detail
            </span>
          ) : (
            // Two identical copies, each at least the strip's width, both sliding one copy-width
            // left: when the first leaves, the second sits exactly where the first began.
            [0, 1].map((copy) => (
              <span
                key={copy}
                aria-hidden={copy === 1}
                style={duration}
                className="ticker-track flex min-w-full shrink-0 items-center justify-around gap-8 pr-8"
              >
                {major.map((e) => (
                  <TapeItem key={e.trend.pid} {...e} showLeague={showLeague} />
                ))}
              </span>
            ))
          )}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {entries.length > major.length && major.length > 0 && `+${entries.length - major.length} `}
          <span className={cn('inline-block transition-transform', open && 'rotate-180')}>▾</span>
        </span>
      </button>

      {open && (
        <ol className="mt-1.5 flex flex-col gap-1.5">
          {entries.map(({ leagues: where, trend }) => {
            const row = (
              <>
                <Arrow trend={trend} />
                <span className={cn('font-medium', !trend.major && 'text-muted-foreground')}>{trend.playerName}</span>
                <span className="text-xs tracking-wider text-muted-foreground uppercase">{trend.slot}</span>
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {trend.metric} <span className="scoreboard text-foreground">{pct(trend.recent)}</span> over the{' '}
                  {trend.games === 1 ? 'last game' : `last ${trend.games} games`}, from{' '}
                  <span className="scoreboard">{pct(trend.baseline)}</span> {trend.baselineLabel}
                </span>
                {showLeague && (
                  <span className="max-w-60 shrink-0 truncate text-xs text-muted-foreground" title={where.map((l) => l.name).join(', ')}>
                    {where.map((l) => l.name).join(', ')}
                  </span>
                )}
              </>
            );
            const rowClass = 'glass flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-4 py-2 text-sm';
            // A player in one league links there; across several there's no single place to go.
            return (
              <li key={trend.pid}>
                {where.length === 1 ? (
                  <Link
                    href={`/leagues/${where[0]!.platform}/${where[0]!.externalLeagueId}`}
                    className={cn(rowClass, 'transition-all outline-none hover:ring-2 hover:ring-brand/40 focus-visible:ring-2 focus-visible:ring-ring')}
                  >
                    {row}
                  </Link>
                ) : (
                  <div className={rowClass}>{row}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
