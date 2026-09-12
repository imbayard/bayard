import type { League } from '@benchpoints/core';
import { useState } from 'react';
import { Skeleton } from '@bench/components/ui/skeleton';
import { useScout } from '@bench/lib/queries';
import type { ScoutPool } from '@bench/lib/api';
import { cn } from '@bench/lib/utils';

/** Matches the API's own cap — a wider frame is refused there, so don't offer it here. */
const MAX_SPAN = 6;
const LAST_REGULAR_WEEK = 18;
const DEFAULT_SPAN = 4;

const POOLS: { value: ScoutPool; label: string }[] = [
  { value: 'waivers', label: 'Waivers' },
  { value: 'roster', label: 'My roster' },
];

const selectClass =
  'h-7 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * A single-hue wash keyed to the 0-100 matchup score: the softer the matchup, the more
 * brand tint the cell carries. One hue rather than a red/green scale — nothing here is
 * good or bad in itself, it's all relative to the other 31 offenses.
 */
function cellTint(score: number | null): string | undefined {
  if (score === null) return undefined;
  return `color-mix(in oklab, var(--brand) ${Math.round(score * 0.22)}%, transparent)`;
}

/** "week 6, 60% off last season" is the honest version of a rank nobody can audit. */
function sourceNote(statsThroughWeek: number, priorSeasonWeight: number, season: number): string {
  const base =
    statsThroughWeek > 0
      ? `Opponent strength from ${season} results through week ${statsThroughWeek}`
      : `Opponent strength from ${season - 1} results`;
  if (priorSeasonWeight <= 0 || statsThroughWeek === 0) return `${base}.`;
  return `${base}, blended ${Math.round(priorSeasonWeight * 100)}% with ${season - 1}.`;
}

export function ScoutBoard({ league }: { league: League }) {
  const [pool, setPool] = useState<ScoutPool>('waivers');
  const [from, setFrom] = useState(league.currentWeek);
  const [span, setSpan] = useState(DEFAULT_SPAN);

  // Keep the frame inside the season no matter which control moved last.
  const to = Math.min(from + span - 1, LAST_REGULAR_WEEK);
  const { data, isPending, isError, error } = useScout(
    league.platform,
    league.externalLeagueId,
    'DEF',
    from,
    to,
    pool,
  );

  const startWeeks = Array.from({ length: LAST_REGULAR_WEEK }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="flex overflow-hidden rounded-lg border border-border">
          {POOLS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPool(option.value)}
              aria-pressed={pool === option.value}
              className={cn(
                'h-7 px-2.5 font-medium transition-colors',
                pool === option.value
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-muted-foreground">
          From
          <select
            className={selectClass}
            value={from}
            onChange={(e) => setFrom(Number(e.target.value))}
          >
            {startWeeks.map((week) => (
              <option key={week} value={week}>
                Week {week}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-muted-foreground">
          for
          <select
            className={selectClass}
            value={span}
            onChange={(e) => setSpan(Number(e.target.value))}
          >
            {Array.from({ length: MAX_SPAN }, (_, i) => i + 1).map((weeks) => (
              <option key={weeks} value={weeks}>
                {weeks === 1 ? '1 week' : `${weeks} weeks`}
              </option>
            ))}
          </select>
        </label>

        <span className="ml-auto text-muted-foreground">
          Defenses
          <span className="ml-1.5 text-[10px]">more positions soon</span>
        </span>
      </div>

      {isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : isError ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Couldn&apos;t load the scout report. {error.message}
        </p>
      ) : data.candidates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {pool === 'waivers'
            ? 'Every defense in this league is rostered.'
            : 'You have no defenses on your roster.'}
        </p>
      ) : (
        <>
          {/* Wide frames scroll inside the card rather than stretching the page. */}
          <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground">
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Defense
                  </th>
                  {data.weeks.map((week) => (
                    <th key={week} scope="col" className="px-2 py-2 text-center font-medium">
                      Wk {week}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Frame
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.candidates.map((candidate) => (
                  <tr key={candidate.playerId} className="border-t border-border">
                    <th scope="row" className="px-3 py-2 text-left font-medium whitespace-nowrap">
                      {candidate.name}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {candidate.nflTeam}
                      </span>
                    </th>
                    {candidate.weeks.map((cell) => (
                      <td
                        key={cell.week}
                        className="px-2 py-2 text-center"
                        style={{ backgroundColor: cellTint(cell.score) }}
                        title={
                          cell.bye
                            ? 'On bye'
                            : `vs ${cell.opponent} — ${cell.rank ?? '?'} of 32 as a matchup`
                        }
                      >
                        {cell.bye ? (
                          <span className="text-xs text-muted-foreground">BYE</span>
                        ) : (
                          <>
                            <span className="text-xs">
                              {cell.home === false ? '@' : ''}
                              {cell.opponent}
                            </span>
                            {cell.rank !== null && (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                #{cell.rank}
                              </span>
                            )}
                          </>
                        )}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {candidate.frameScore}
                      {candidate.byeCount > 0 && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          {candidate.byeCount} bye{candidate.byeCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            {sourceNote(data.meta.statsThroughWeek, data.meta.priorSeasonWeight, data.meta.season)}{' '}
            Rank is 1-32 across the league; frame score sums the weeks, counting a bye as zero.
          </p>
        </>
      )}
    </div>
  );
}
