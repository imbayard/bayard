import type { League } from '@benchpoints/core';
import { type CSSProperties, useState } from 'react';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@bench/components/ui/popover';
import { Skeleton } from '@bench/components/ui/skeleton';
import { useScout } from '@bench/lib/queries';

/** Matches the API's own cap — a wider frame is refused there, so don't offer it here. */
const MAX_SPAN = 6;
const LAST_REGULAR_WEEK = 18;
const DEFAULT_SPAN = 4;

const selectClass =
  'h-7 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50';

/**
 * A diverging wash keyed to the 0-100 matchup score: red at the hard end, dark green at the
 * soft end, near-neutral through the middle so the extremes are what the eye lands on.
 * Alpha rather than an opaque fill, so one scale composites over the card in either theme.
 */
function cellTint(score: number | null): string | undefined {
  if (score === null) return undefined;
  const hue = score * 1.42; // 0 (red) -> 142 (green)
  const lightness = 50 - score * 0.18; // the good end reads dark green, not pale mint
  const alpha = 0.08 + 0.32 * (Math.abs(score - 50) / 50); // quiet mid-table, saturated ends
  return `hsl(${hue.toFixed(0)} 70% ${lightness.toFixed(0)}% / ${alpha.toFixed(2)})`;
}

/**
 * The owner's own defenses sit in the waivers board for comparison; yellow says which are already
 * theirs. The color is declared once here and every consumer reads from it, so the rail and its
 * legend chip can't drift apart.
 */
const OWNED_HSL = '48 96% 50%';

/** The rail as it rides a table cell: a faint wash behind the name, a hard 3px edge at the left. */
const ownedRail: CSSProperties = {
  backgroundColor: `hsl(${OWNED_HSL} / 0.14)`,
  boxShadow: `inset 3px 0 0 hsl(${OWNED_HSL})`,
};

/**
 * The legend chip takes the color, not the geometry. A 3px inset edge is an edge on a full-width
 * cell; on a 14px chip it eats one side and the chip reads as a crescent.
 */
const ownedChip: CSSProperties = { backgroundColor: `hsl(${OWNED_HSL})` };

/** One chip of the visual key: the real color, with its label beside it — never color alone. */
function Swatch({ style, children }: { style: CSSProperties; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 rounded-sm ring-1 ring-foreground/15"
        style={style}
      />
      {children}
    </span>
  );
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
    'waivers',
  );

  const startWeeks = Array.from({ length: LAST_REGULAR_WEEK }, (_, i) => i + 1);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium">Available Defenses</span>

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

        <span className="ml-auto text-[10px] text-muted-foreground">more positions soon</span>
      </div>

      {isPending ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : isError ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Couldn&apos;t load the scout report. {error.message}
        </p>
      ) : data.candidates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          Every defense in this league is on a rival roster.
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
                    {/* Yellow rides the name cell, not the row: a wash over the week cells
                        would tint the red-green scale the comparison depends on. */}
                    <th
                      scope="row"
                      className="px-3 py-2 text-left font-medium whitespace-nowrap"
                      style={candidate.owned ? ownedRail : undefined}
                    >
                      {candidate.name}
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {candidate.nflTeam}
                      </span>
                      {/* Season form, as context for a matchup-only ranking — not the headline. */}
                      {candidate.avgPointsPerWeek != null && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground tabular-nums">
                          {candidate.avgPointsPerWeek.toFixed(1)} ppg
                        </span>
                      )}
                    </th>
                    {candidate.weeks.map((cell) => (
                      <td
                        key={cell.week}
                        className="px-2 py-2 text-center"
                        style={{ backgroundColor: cellTint(cell.score) }}
                        title={
                          cell.bye
                            ? 'On bye'
                            : `vs ${cell.opponent} — ${cell.rank ?? '?'} of 32 as a matchup` +
                              (cell.weather ? `\n${cell.weather.summary}` : '')
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
                            {/* Context under the matchup, not part of it — the tint stays about the opponent. */}
                            {cell.weather && (
                              <span
                                className={`block text-[10px] leading-tight whitespace-nowrap ${
                                  cell.weather.severity === 'harsh'
                                    ? 'font-semibold text-destructive'
                                    : 'text-amber-700 dark:text-amber-400'
                                }`}
                              >
                                {cell.weather.summary}
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
          {/* The key decodes the table at a glance; the method sits one click away. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            <Swatch style={{ backgroundColor: cellTint(100) }}>Softer matchup</Swatch>
            <Swatch style={{ backgroundColor: cellTint(0) }}>Harder matchup</Swatch>
            <Swatch style={ownedChip}>Already rostered</Swatch>

            <Popover>
              <PopoverTrigger className="ml-auto underline decoration-dotted underline-offset-2 outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50">
                How this works
              </PopoverTrigger>
              <PopoverContent align="end" className="text-xs">
                <PopoverTitle className="text-xs">How this works</PopoverTitle>
                <PopoverDescription
                  render={
                    <ul className="flex list-none flex-col gap-1.5">
                      <li>
                        {sourceNote(
                          data.meta.statsThroughWeek,
                          data.meta.priorSeasonWeight,
                          data.meta.season,
                        )}
                      </li>
                      <li>Rank is 1-32 across the league.</li>
                      <li>
                        Weather shows under a matchup this week and next, when it&apos;s worth
                        noting. It doesn&apos;t move the score — rough weather tends to help a
                        defense, but the rank stays about the opponent.
                      </li>
                      <li>Frame score sums the weeks, counting a bye as zero.</li>
                      <li>
                        Ppg is this season&apos;s average, shown for form — it doesn&apos;t move the
                        ranking.
                      </li>
                    </ul>
                  }
                />
              </PopoverContent>
            </Popover>
          </div>
        </>
      )}
    </div>
  );
}
