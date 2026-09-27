import { useState } from 'react';
import type { NflGameState, RootingRow, RootingSide } from '@benchpoints/core';
import { format, isValid, parseISO } from 'date-fns';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { PositionTag } from '@bench/components/system/position-tag';
import { Skeleton } from '@bench/components/ui/skeleton';
import { useRooting } from '@bench/lib/queries';
import { cn } from '@bench/lib/utils';

type Tab = 'root' | 'performers';

const TABS: { id: Tab; label: string }[] = [
  { id: 'root', label: 'To Root For' },
  { id: 'performers', label: 'Top Performers' },
];

const PAGE_SIZE = 10;

const SIDE_LABEL: Record<RootingSide, string> = { for: 'Root for', against: 'Root against' };

/** Projections for the rooting tab; live points for performers, where a zero means "hasn't done anything yet". */
function ranked(rows: RootingRow[], side: RootingSide, tab: Tab): RootingRow[] {
  const onSide = rows.filter((r) => r.side === side);
  if (tab === 'root') return onSide.sort((a, b) => b.projectedPoints - a.projectedPoints);
  return onSide.filter((r) => r.actualPoints !== 0).sort((a, b) => b.actualPoints - a.actualPoints);
}

function total(row: RootingRow, tab: Tab): number {
  return tab === 'root' ? row.projectedPoints : row.actualPoints;
}

function points(row: RootingRow, tab: Tab): string {
  return total(row, tab).toFixed(1);
}

/** Per-league average — the net total spread over every lineup it's built from. */
function average(row: RootingRow, tab: Tab): string {
  return (total(row, tab) / row.stakes.length).toFixed(1);
}

function leagueNote(row: RootingRow): string {
  return row.stakes.length > 1 ? `${row.stakes.length} lineups` : row.stakes[0]!.leagueName;
}

function stakesTitle(row: RootingRow): string {
  return row.stakes
    .map((s) => `${s.leagueName} · ${s.side === 'for' ? 'mine' : 'opponent'} · ${(s.projectedPoints ?? 0).toFixed(1)} proj`)
    .join('\n');
}

/** Where the player's NFL game stands: kickoff time, live, or final. Nothing on bye. */
function GameStatus({ game, className }: { game: NflGameState | null; className?: string }) {
  if (!game) return null;
  const base = 'inline-flex shrink-0 items-center gap-1 text-[11px] font-medium tracking-wider uppercase';
  if (game.state === 'in') {
    return (
      <span className={cn(base, 'text-positive', className)}>
        <span className="size-1.5 animate-pulse rounded-full bg-positive" />
        Live
      </span>
    );
  }
  if (game.state === 'post') {
    return (
      <span className={cn(base, 'text-muted-foreground', className)}>
        <span className="size-1.5 rounded-full bg-muted-foreground" />
        Final
      </span>
    );
  }
  const kickoff = parseISO(game.kickoff);
  return (
    <span className={cn(base, 'text-muted-foreground', className)}>
      <span className="size-1.5 rounded-full border border-muted-foreground" />
      {isValid(kickoff) ? format(kickoff, 'EEE h:mmaaaaa') : 'Upcoming'}
    </span>
  );
}

/** One side of the headline row. Mirrored so both candidates face the center, broadcast-style. */
function Leader({ row, side, tab }: { row: RootingRow | undefined; side: RootingSide; tab: Tab }) {
  const mirrored = side === 'for';
  return (
    <div className={cn('flex min-w-0 items-center gap-3 sm:gap-4', mirrored && 'flex-row-reverse text-right')}>
      <span
        className={cn(
          'scoreboard text-2xl leading-none font-bold sm:text-3xl',
          side === 'for' ? 'text-positive' : 'text-destructive',
        )}
      >
        {row ? points(row, tab) : '—'}
      </span>
      <div className={cn('flex min-w-0 flex-col gap-1', mirrored && 'items-end')}>
        <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          {SIDE_LABEL[side]}
        </span>
        <span className="truncate text-sm font-semibold sm:text-base">{row?.fullName ?? 'Nobody yet'}</span>
        {row && (
          <span className={cn('flex items-center gap-1.5 text-xs text-muted-foreground', mirrored && 'flex-row-reverse')}>
            <PositionTag position={row.position} />
            <span className="truncate" title={stakesTitle(row)}>
              {leagueNote(row)}
            </span>
            <GameStatus game={row.game} />
          </span>
        )}
      </div>
    </div>
  );
}

function SideList({ rows, side, tab }: { rows: RootingRow[]; side: RootingSide; tab: Tab }) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const visible = rows.slice(start, start + PAGE_SIZE);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3
        className={cn(
          'text-[11px] font-semibold tracking-wider uppercase',
          side === 'for' ? 'text-positive' : 'text-destructive',
        )}
      >
        {SIDE_LABEL[side]}
      </h3>
      {visible.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          {tab === 'performers' ? 'No points on the board yet.' : 'No starters on this side.'}
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {visible.map((row) => (
            <li key={row.key} className="flex items-center gap-3 py-1.5 text-sm">
              <PositionTag position={row.position} />
              <span className="min-w-0 flex-1 truncate font-medium">{row.fullName}</span>
              <span className="hidden truncate text-xs text-muted-foreground sm:inline" title={stakesTitle(row)}>
                {leagueNote(row)}
              </span>
              <span className="flex w-20 shrink-0 justify-end">
                <GameStatus game={row.game} />
              </span>
              <span className="scoreboard w-12 shrink-0 text-right font-semibold" title="Average per league">
                {average(row, tab)}
              </span>
              <span className="scoreboard w-12 shrink-0 text-right opacity-60" title="Total across leagues">
                {points(row, tab)}
              </span>
            </li>
          ))}
        </ol>
      )}
      {pages > 1 && (
        <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
          <span className="tabular-nums">
            Page {page + 1}: {start + 1}–{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length}
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous page"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded p-1 hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="rounded p-1 hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

export function RootingBoard() {
  const { data, isPending, isError } = useRooting();
  const [tab, setTab] = useState<Tab>('root');
  const [expanded, setExpanded] = useState(false);

  if (isPending) return <Skeleton className="h-28 rounded-2xl" />;
  if (isError || data.rows.length === 0) return null;

  const forRows = ranked(data.rows, 'for', tab);
  const againstRows = ranked(data.rows, 'against', tab);

  return (
    <section aria-label="Rooting guide" className="glass rounded-2xl px-4 py-4 sm:px-6 sm:py-5">
      <div className="mb-3 flex items-center justify-center gap-1" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              // The widget's scoped preflight zeroes `border-width` on every element (unlayered,
              // so it beats any Tailwind border-* utility) — box-shadow is untouched by it, so
              // an inset shadow is what actually renders an underline here.
              'px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase transition-colors',
              tab === t.id
                ? 'text-foreground shadow-[inset_0_-2px_0_0_var(--brand)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-6"
      >
        <Leader row={forRows[0]} side="for" tab={tab} />
        <span className="flex flex-col items-center gap-1 text-muted-foreground">
          <span className="h-8 w-px bg-border" />
          <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
        </span>
        <Leader row={againstRows[0]} side="against" tab={tab} />
      </button>

      {expanded && (
        // Keyed by tab so switching tabs resets both lists to page one.
        <div key={tab} className="mt-4 grid gap-6 border-t border-border pt-4 sm:grid-cols-2">
          <SideList rows={forRows} side="for" tab={tab} />
          <SideList rows={againstRows} side="against" tab={tab} />
        </div>
      )}
    </section>
  );
}
