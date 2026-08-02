
import type { League } from '@benchpoints/core';
import { Skeleton } from '@bench/components/ui/skeleton';
import { useHiddenAlerts } from '@bench/lib/hidden-alerts';
import { computePortfolioHealth, scoreToColor } from '@bench/lib/portfolio-health';
import { useLeagueSummaries } from '@bench/lib/queries';
import { cn } from '@bench/lib/utils';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Renders a number with its decimal portion (if any) in a smaller, muted size. */
function RecordNumber({ n }: { n: number }) {
  const [whole, decimal] = String(round1(n)).split('.');
  return (
    <>
      {whole}
      {decimal && <span className="text-xs font-normal text-muted-foreground">.{decimal}</span>}
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span
        className={cn(
          'scoreboard text-2xl leading-none font-bold',
          tone === 'good' && 'text-positive',
          tone === 'bad' && 'text-destructive',
        )}
      >
        {value}
      </span>
      <span className="truncate text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </span>
    </div>
  );
}

/** Circular deck-health dial: arc + glow driven by the 1–99 stress score. */
function HealthGauge({ score, color }: { score: number; color: string }) {
  const r = 26;
  const circumference = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <div className="flex items-center gap-3">
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

  const avgWins = teamsCounted > 0 ? wins / teamsCounted : 0;
  const avgLosses = teamsCounted > 0 ? losses / teamsCounted : 0;
  const avgTies = teamsCounted > 0 ? ties / teamsCounted : 0;
  // Games actually completed so far — not the same as the current (in-progress) week.
  const gamesPlayed = teamsCounted > 0 ? round1(avgWins + avgLosses + avgTies) : 0;

  const withMatchup = summaries.filter((s) => s.myMatchup && s.opponentMatchup);
  const winningNow = withMatchup.filter(
    (s) => (s.myMatchup?.points ?? 0) > (s.opponentMatchup?.points ?? 0),
  ).length;

  const score = computePortfolioHealth(summaries, hidden);
  const scoreColor = scoreToColor(score);

  return (
    <section
      aria-label="Portfolio pulse"
      className="glass relative flex items-center gap-6 overflow-hidden rounded-2xl px-6 py-5"
    >
      {/* Ambient glow tinted by portfolio health, bleeding in from the gauge side. */}
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 -right-10 size-52 -translate-y-1/2 rounded-full opacity-15 blur-3xl"
        style={{ background: scoreColor }}
      />
      <div className="flex flex-1 items-center gap-8">
        <Stat
          label={gamesPlayed > 0 ? `Avg record · ${gamesPlayed} wks` : 'Average record'}
          value={
            <>
              <RecordNumber n={avgWins} />-<RecordNumber n={avgLosses} />
              {avgTies > 0 && (
                <>
                  -<RecordNumber n={avgTies} />
                </>
              )}{' '}
              <span className="text-sm font-normal text-muted-foreground">({winPct}%)</span>
            </>
          }
        />
        <div className="h-10 w-px bg-border" />
        <Stat
          label="Winning this week"
          value={withMatchup.length > 0 ? `${winningNow}/${withMatchup.length}` : '—'}
          tone={
            withMatchup.length > 0
              ? winningNow >= withMatchup.length - winningNow
                ? 'good'
                : 'bad'
              : undefined
          }
        />
      </div>
      <HealthGauge score={score} color={scoreColor} />
    </section>
  );
}
