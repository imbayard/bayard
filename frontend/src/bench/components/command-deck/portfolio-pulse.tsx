
import type { League } from '@benchpoints/core';
import { Skeleton } from '@bench/components/ui/skeleton';
import { useHiddenAlerts } from '@bench/lib/hidden-alerts';
import { computePortfolioHealth, scoreToColor } from '@bench/lib/portfolio-health';
import { useLeagueSummaries } from '@bench/lib/queries';
import { cn } from '@bench/lib/utils';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function Stat({
  label,
  shortLabel,
  value,
  tone,
}: {
  label: string;
  /** Phone-width wording; the full label needs room this bar doesn't have under sm. */
  shortLabel?: string;
  value: React.ReactNode;
  tone?: 'good' | 'bad';
}) {
  const labelClass =
    'max-w-40 text-[11px] font-medium tracking-wider text-balance text-muted-foreground uppercase sm:max-w-64';
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span
        className={cn(
          'scoreboard text-xl leading-none font-bold sm:text-2xl',
          tone === 'good' && 'text-positive',
          tone === 'bad' && 'text-destructive',
        )}
      >
        {value}
      </span>
      {/* Capped so a long label wraps to a second line instead of clipping or pushing the gauge. */}
      <span className={cn(labelClass, shortLabel && 'sm:hidden')}>{shortLabel ?? label}</span>
      {shortLabel && <span className={cn(labelClass, 'hidden sm:inline')}>{label}</span>}
    </div>
  );
}

/** Circular deck-health dial: arc + glow driven by the 1–99 stress score. */
function HealthGauge({ score, color }: { score: number; color: string }) {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="flex w-full items-center gap-3 sm:w-auto">
      <div className="relative flex items-center justify-center">
        <svg width="68" height="68" viewBox="0 0 68 68" className="-rotate-90">
          <circle cx="34" cy="34" r={r} fill="none" strokeWidth="5" className="stroke-muted" />
          <circle
            cx="34"
            cy="34"
            r={r}
            fill="none"
            strokeWidth="5"
            stroke={color}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
            style={{ filter: `drop-shadow(0 0 5px ${color})`, transition: 'stroke-dashoffset 600ms ease' }}
          />
        </svg>
        <span className="scoreboard absolute text-base font-bold" style={{ color }}>
          {Math.round(score)}
        </span>
      </div>
      <span className="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        Portfolio
        <br />
        Health
      </span>
    </div>
  );
}

export function PortfolioPulse({ leagues, isLoading }: { leagues: League[]; isLoading: boolean }) {
  const summaries = useLeagueSummaries(leagues);
  const { hidden } = useHiddenAlerts();
  const pending = isLoading || summaries.some((s) => s.isLoading);

  if (pending) {
    return <Skeleton className="h-24 rounded-2xl" />;
  }

  let wins = 0;
  let losses = 0;
  let ties = 0;
  let teamsCounted = 0;
  for (const s of summaries) {
    if (!s.myTeam) continue;
    wins += s.myTeam.wins;
    losses += s.myTeam.losses;
    ties += s.myTeam.ties;
    teamsCounted += 1;
  }

  const totalGames = wins + losses + ties;
  const winPct = totalGames > 0 ? round1((wins / totalGames) * 100) : 0;

  // Games actually completed so far — not the same as the current (in-progress) week.
  const gamesPlayed = teamsCounted > 0 ? round1(totalGames / teamsCounted) : 0;

  // Projections, not live points: before kickoff every score is 0.0, so comparing points
  // would flag a clean sweep of losses in a week nobody has played yet.
  const projected = summaries
    .map((s) => ({
      // bench-iq sums my starters' projection too — lean on it while the matchup side is still null.
      mine: s.myMatchup?.projectedPoints ?? s.benchIq?.projectedPoints ?? null,
      opp: s.opponentMatchup?.projectedPoints ?? null,
    }))
    .filter((p): p is { mine: number; opp: number } => p.mine !== null && p.opp !== null);
  const projectedAhead = projected.filter((p) => p.mine > p.opp).length;
  // An even split (or no projections at all) is neither good nor bad — leave it untinted.
  const projectedTone =
    projected.length === 0 || projectedAhead * 2 === projected.length
      ? undefined
      : projectedAhead * 2 > projected.length
        ? ('good' as const)
        : ('bad' as const);

  const score = computePortfolioHealth(summaries, hidden);
  const scoreColor = scoreToColor(score);

  return (
    <section
      aria-label="Portfolio pulse"
      className="glass relative flex flex-wrap items-center gap-4 overflow-hidden rounded-2xl px-4 py-4 sm:flex-nowrap sm:gap-6 sm:px-6 sm:py-5"
    >
      {/* Ambient glow tinted by portfolio health, bleeding in from the gauge side. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 -right-10 size-52 -translate-y-1/2 rounded-full opacity-15 blur-3xl"
        style={{ background: scoreColor }}
      />
      <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-8">
        <Stat
          label={
            gamesPlayed > 0
              ? `Cumulative Winning Percentage · ${gamesPlayed} wks`
              : 'Cumulative Winning Percentage'
          }
          shortLabel={gamesPlayed > 0 ? `Win % · ${gamesPlayed} wks` : 'Win %'}
          value={totalGames > 0 ? `${winPct}%` : '—'}
        />
        <div className="h-10 w-px bg-border" />
        <Stat
          label="Projected this week"
          shortLabel="Projected"
          value={projected.length > 0 ? `${projectedAhead}/${projected.length}` : '—'}
          tone={projectedTone}
        />
      </div>
      <HealthGauge score={score} color={scoreColor} />
    </section>
  );
}
