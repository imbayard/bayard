import { useMemo } from 'react';
import type { DraftStatus, DraftPick, League } from '@benchpoints/core';
// Deep import on purpose: `@benchpoints/core`'s barrel instantiates the mock adapters at module
// scope, so importing a value through it drags the adapters and fixtures into the SPA bundle.
import { computeRosterNeeds, type PositionNeed } from '@benchpoints/core/compute/roster-needs';
import { Badge } from '@bench/components/ui/badge';
import { PositionTag } from '@bench/components/system/position-tag';
import { Skeleton } from '@bench/components/ui/skeleton';
import { useBenchIq, useDraft, useTeams } from '@bench/lib/queries';
import { cn } from '@bench/lib/utils';
import { positionColor, positionSurface } from '../../../lib/positions';

const STATUS_LABEL: Record<DraftStatus, string> = {
  pre_draft: 'Scheduled',
  drafting: 'Live',
  paused: 'Paused',
  complete: 'Complete',
};

/** Flex slots are too wide to spell out in a 3-per-row chip strip. */
const SLOT_ABBREVIATIONS: Record<string, string> = {
  FLEX: 'FLX',
  SUPER_FLEX: 'SFLX',
  OP: 'SFLX',
  'QB/RB/WR/TE': 'SFLX',
  WRRB_FLEX: 'W/R',
  'RB/WR': 'W/R',
  REC_FLEX: 'W/T',
};

/**
 * One starter slot's fill state. Dedicated slots take their position's color; flex slots
 * are neutral, since they aren't any one position. Met slots dim, so what's left to draft
 * is what stands out.
 */
function NeedChip({ need }: { need: PositionNeed }) {
  const isFlex = need.eligible.length > 1;
  const isMet = need.filled >= need.required;
  const color = isFlex ? positionColor(null) : positionColor(need.slot);

  return (
    <span
      className="inline-flex h-4 items-center gap-1 rounded px-1 text-[10px] font-semibold"
      style={{
        color,
        backgroundColor: isFlex ? positionSurface(null, 10) : positionSurface(need.slot),
        opacity: isMet ? 0.4 : 1,
      }}
      title={isFlex ? need.eligible.join(', ') : undefined}
    >
      {SLOT_ABBREVIATIONS[need.slot] ?? need.slot}
      <span className="tabular-nums">
        {need.filled}/{need.required}
      </span>
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/** Draft convention: round.pick-within-round, e.g. the 17th pick of a 10-team draft is 2.07. */
function pickLabel(pick: DraftPick, teamCount: number): string {
  if (teamCount <= 0) return `#${pick.pickNo}`;
  const withinRound = pick.pickNo - (pick.round - 1) * teamCount;
  return `${pick.round}.${String(withinRound).padStart(2, '0')}`;
}

function TeamColumn({
  name,
  slot,
  picks,
  needs,
  teamCount,
  isMine,
  isOnTheClock,
}: {
  name: string;
  slot: number | null;
  picks: DraftPick[];
  needs: PositionNeed[];
  teamCount: number;
  isMine: boolean;
  isOnTheClock: boolean;
}) {
  return (
    <div
      className={cn(
        'flex w-48 shrink-0 flex-col rounded-xl bg-card ring-1 ring-foreground/10',
        isOnTheClock && 'ring-2 ring-brand',
      )}
    >
      <div className="border-b border-foreground/5 px-3 py-2">
        <div className="flex items-baseline gap-2">
          {slot !== null && (
            <span className="text-xs tabular-nums text-muted-foreground">{slot}</span>
          )}
          <span
            className={cn('min-w-0 flex-1 truncate text-sm font-medium', isMine && 'text-brand')}
          >
            {name}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">{picks.length}</span>
        </div>
        {needs.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {needs.map((need) => (
              <NeedChip key={need.slot} need={need} />
            ))}
          </div>
        )}
      </div>
      {isOnTheClock && (
        <div className="border-b border-foreground/5 px-3 py-1 text-xs font-medium text-brand">
          On the clock
        </div>
      )}
      <ul className="divide-y divide-foreground/5">
        {picks.map((pick) => (
          <li
            key={pick.pickNo}
            className="border-l-2 px-3 py-2"
            style={{ borderLeftColor: positionColor(pick.position) }}
          >
            <div className="flex items-baseline gap-2">
              <span className="w-9 shrink-0 text-xs tabular-nums text-muted-foreground">
                {pickLabel(pick, teamCount)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{pick.playerName}</span>
            </div>
            <div className="flex items-center gap-1.5 pl-11 text-xs text-muted-foreground">
              <PositionTag position={pick.position} />
              {pick.nflTeam && <span>{pick.nflTeam}</span>}
              {pick.isKeeper && <span>· keeper</span>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Who drafted what, one column per team. Columns follow the draft board's slot order once it's
 * set; before that (and for a draft that never had an order) they fall back to the league's
 * team order. Polling is handled by `useDraft` — it only refetches while the draft is running.
 */
export function DraftBoard({ league }: { league: League }) {
  const draft = useDraft(league.platform, league.externalLeagueId);
  const teams = useTeams(league.platform, league.externalLeagueId);
  const benchIq = useBenchIq(league.platform, league.externalLeagueId);

  const state = draft.data?.draft ?? null;
  const picks = draft.data?.picks;

  const nameByTeamId = useMemo(
    () => new Map(teams.data?.map((t) => [t.externalTeamId, t.displayName]) ?? []),
    [teams.data],
  );

  const picksByTeamId = useMemo(() => {
    const grouped = new Map<string, DraftPick[]>();
    for (const pick of picks ?? []) {
      const existing = grouped.get(pick.externalTeamId);
      if (existing) existing.push(pick);
      else grouped.set(pick.externalTeamId, [pick]);
    }
    return grouped;
  }, [picks]);

  // Slot order once the draft order is set; before that, whatever teams we know of.
  const columns = useMemo(() => {
    const slots = Object.entries(state?.slotByTeamId ?? {});
    if (slots.length > 0) {
      return slots
        .sort(([, a], [, b]) => a - b)
        .map(([teamId, slot]) => ({ teamId, slot: slot as number | null }));
    }
    return [...new Set([...picksByTeamId.keys(), ...nameByTeamId.keys()])].map((teamId) => ({
      teamId,
      slot: null,
    }));
  }, [state, picksByTeamId, nameByTeamId]);

  const needsByTeamId = useMemo(
    () =>
      new Map(
        columns.map(({ teamId }) => [
          teamId,
          computeRosterNeeds(
            league.rosterSlots,
            (picksByTeamId.get(teamId) ?? []).map((pick) => pick.position),
          ).needs,
        ]),
      ),
    [columns, picksByTeamId, league.rosterSlots],
  );

  if (draft.isPending) {
    return <Skeleton className="h-48 rounded-xl" />;
  }
  // A league with no draft (or a platform that doesn't expose one) errors — that's not a failure
  // worth alarming about, it just means there's no board to show.
  if (draft.isError || !state || !picks) {
    return <Empty>No draft board for this league.</Empty>;
  }

  const myTeamId = benchIq.data?.teamId ?? null;

  const onTheClockName =
    state.onTheClockTeamId !== null
      ? (nameByTeamId.get(state.onTheClockTeamId) ?? `Team ${state.onTheClockTeamId}`)
      : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge
          variant={state.status === 'drafting' ? 'default' : 'outline'}
          className={state.status === 'drafting' ? 'bg-brand text-brand-foreground' : undefined}
        >
          {STATUS_LABEL[state.status]}
        </Badge>
        <span className="tabular-nums">
          {state.madePicks} of {state.totalPicks} picks
        </span>
        {state.currentPickNo !== null && (
          <span className="tabular-nums">
            · round {Math.ceil(state.currentPickNo / Math.max(state.teamCount, 1))} of {state.rounds}
          </span>
        )}
        {onTheClockName && (
          <span className="text-brand">
            · <span className="font-medium">{onTheClockName}</span> on the clock
          </span>
        )}
      </div>

      {picks.length === 0 ? (
        <Empty>
          {state.startTime
            ? `No picks yet. Draft starts ${new Date(state.startTime).toLocaleString()}.`
            : 'No picks yet. The draft has not been scheduled.'}
        </Empty>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-2">
          {columns.map(({ teamId, slot }) => (
            <TeamColumn
              key={teamId}
              name={nameByTeamId.get(teamId) ?? `Team ${teamId}`}
              slot={slot}
              picks={picksByTeamId.get(teamId) ?? []}
              needs={needsByTeamId.get(teamId) ?? []}
              teamCount={state.teamCount}
              isMine={teamId === myTeamId}
              isOnTheClock={teamId === state.onTheClockTeamId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
