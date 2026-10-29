import { useState } from 'react';
import type { Platform, SideDelta, TradeAsset, TradeMode, TradePackage, TradePartner } from '@benchpoints/core';
import { Link } from '@bench/lib/nav';
import { useLeagues, useTrades } from '@bench/lib/queries';
import { cn } from '@bench/lib/utils';
import { Skeleton } from '@bench/components/ui/skeleton';
import { Switch } from '@bench/components/ui/switch';
import { PlatformBadge } from '@bench/components/system/platform-badge';

/** Fairness is judged within ±15% (bench-core compute/trades); the meter spans that band. */
const FAIR_BAND = 0.15;

const signed = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x).toFixed(1)}`;

/**
 * Trade Radar: every fair deal between my team and the rest of the league, grouped by partner.
 * Mode and the market toggle are session-only — nothing here is remembered.
 */
export function TradesView({ platform, leagueId }: { platform: Platform; leagueId: string }) {
  const [mode, setMode] = useState<TradeMode | undefined>(undefined);
  const [market, setMarket] = useState(true);
  const { data: leagues } = useLeagues();
  const league = leagues?.leagues.find((l) => l.platform === platform && l.externalLeagueId === leagueId);
  const { data, isPending, isError, error } = useTrades(platform, leagueId, mode, market);
  const leagueHref = `/leagues/${platform}/${encodeURIComponent(leagueId)}`;
  const shownMode = mode ?? data?.suggestedMode;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Link href={leagueHref} className="text-sm text-muted-foreground hover:text-foreground">
          ← {league?.name ?? 'League'}
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          Find trades
          <PlatformBadge platform={platform} />
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <div role="group" aria-label="Mode" className="inline-flex rounded-lg ring-1 ring-foreground/15">
          {(['buyer', 'seller'] as const).map((m) => (
            <button key={m} type="button" aria-pressed={shownMode === m} onClick={() => setMode(m)}>
              {/* The fill rides a span: bench.css's unlayered button reset outranks bg-* utilities on <button>. */}
              <span
                className={cn(
                  'block px-3 py-1 text-xs font-medium capitalize',
                  m === 'buyer' ? 'rounded-l-lg' : 'rounded-r-lg',
                  shownMode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {m}
              </span>
            </button>
          ))}
        </div>
        {data && (
          <span className="text-xs text-muted-foreground">
            Suggested: {data.suggestionReason}
          </span>
        )}
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Switch checked={market && data?.market !== 'unavailable'} onCheckedChange={setMarket} disabled={data?.market === 'unavailable'} />
          Market values
        </label>
      </div>

      {data?.market === 'unavailable' && (
        <Notice>FantasyCalc couldn&apos;t be reached, so fairness is judged on our values alone.</Notice>
      )}
      {data?.earlySeason && (
        <Notice>Early season: season PPG is a couple of games, so values lean mostly on last season.</Notice>
      )}

      {isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      ) : isError ? (
        <Empty>Couldn&apos;t find trades. {error.message}</Empty>
      ) : data.partners.length === 0 ? (
        <Empty>
          {data.emptyReason}{' '}
          <button
            type="button"
            className="font-medium text-foreground underline underline-offset-4"
            onClick={() => setMode(data.mode === 'buyer' ? 'seller' : 'buyer')}
          >
            Switch to {data.mode === 'buyer' ? 'seller' : 'buyer'}
          </button>
        </Empty>
      ) : (
        <>
          {data.myNeeds.length > 0 && (
            <p className="text-xs text-muted-foreground">Your needs: {data.myNeeds.join(', ')}</p>
          )}
          {data.partners.map((partner) => (
            <PartnerGroup key={partner.externalTeamId} partner={partner} />
          ))}
        </>
      )}
    </div>
  );
}

function PartnerGroup({ partner }: { partner: TradePartner }) {
  const context = [
    partner.needs.length > 0 && `Needs ${partner.needs.join(', ')}`,
    partner.surplus.length > 0 && `Surplus ${partner.surplus.map((s) => `${s.position} (${s.count})`).join(', ')}`,
  ].filter(Boolean);

  return (
    <section aria-label={partner.displayName} className="flex flex-col gap-2">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{partner.displayName}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {partner.record} · {ordinal(partner.standing)}
        </span>
        {context.length > 0 && <span className="text-xs text-muted-foreground sm:ml-auto">{context.join(' · ')}</span>}
      </header>
      {partner.packages.map((pkg, i) => (
        <PackageCard key={i} pkg={pkg} />
      ))}
    </section>
  );
}

function PackageCard({ pkg }: { pkg: TradePackage }) {
  return (
    <article className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="grid grid-cols-1 sm:grid-cols-2">
        <Side label="Give" assets={pkg.give} />
        <Side label="Get" assets={pkg.get} className="border-t border-border sm:border-t-0 sm:border-l" />
      </div>
      <div className="flex flex-col gap-1.5 border-t border-border px-3 py-2 text-xs">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <Delta who="You" delta={pkg.you} />
          <Delta who="Them" delta={pkg.them} />
        </div>
        <Fairness fairness={pkg.fairness} />
        <p className="text-muted-foreground">{pkg.reason}</p>
      </div>
    </article>
  );
}

function Side({ label, assets, className }: { label: string; assets: TradeAsset[]; className?: string }) {
  return (
    <div className={cn('px-3 py-2', className)}>
      <h3 className="mb-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">{label}</h3>
      <ul className="flex flex-col gap-1">
        {assets.map((a) => (
          <li key={a.externalPlayerId} className="flex items-baseline gap-2 text-sm">
            <span className="w-6 shrink-0 text-[10px] text-muted-foreground">{a.position}</span>
            <span className="truncate font-medium">{a.name}</span>
            <span className="text-[10px] text-muted-foreground">{a.nflTeam}</span>
            <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
              {a.ppg === null ? '—' : `${a.ppg.toFixed(1)} ppg`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Lineup PPG is the headline — a bench player arriving moves nothing; the raw sum explains it. */
function Delta({ who, delta }: { who: string; delta: SideDelta }) {
  return (
    <span className="tabular-nums">
      <span className="text-muted-foreground">{who} </span>
      <span className={cn('font-medium', delta.lineup > 0 && 'text-emerald-400', delta.lineup < 0 && 'text-red-400')}>
        {signed(delta.lineup)} lineup ppg
      </span>
      <span className="text-muted-foreground"> ({signed(delta.raw)} raw)</span>
    </span>
  );
}

function Fairness({ fairness }: { fairness: TradePackage['fairness'] }) {
  const label = fairness.basis === 'market' ? 'Market' : 'Our value';
  const fmt = (x: number) => (fairness.basis === 'market' ? Math.round(x).toLocaleString() : x.toFixed(1));
  // Marker sits on a ±15% band: centre is dead even, right edge is "you get 15% more".
  const position = 50 + (fairness.diff / FAIR_BAND) * 50;

  return (
    <div className="flex items-center gap-2 tabular-nums">
      <span className="text-muted-foreground">
        {label} {fmt(fairness.give)} → {fmt(fairness.get)}
      </span>
      <span className="relative h-1.5 w-24 rounded-full bg-muted" aria-hidden>
        <span className="absolute top-0 left-1/2 h-full w-px bg-foreground/30" />
        <span
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
          style={{ left: `${Math.min(100, Math.max(0, position))}%` }}
        />
      </span>
      <span className="text-muted-foreground">
        fair ({fairness.diff >= 0 ? '+' : '−'}
        {Math.round(Math.abs(fairness.diff) * 100)}%)
      </span>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">{children}</p>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">{children}</p>
  );
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}
