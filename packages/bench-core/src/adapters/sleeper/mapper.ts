import type {
  Draft,
  DraftPick,
  DraftStatus,
  DraftType,
  League,
  Matchup,
  Player,
  Roster,
  RosterEntry,
  Team,
} from '../../types/league.js';
import type {
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperPlayer,
  SleeperProjectionsResponse,
  SleeperRoster,
} from './types.js';

export function mapLeague(
  raw: SleeperLeague,
  currentWeek: number,
  draftDate: string | null,
  draftStatus: DraftStatus | null,
): League {
  return {
    platform: 'sleeper',
    externalLeagueId: raw.league_id,
    name: raw.name,
    season: Number(raw.season),
    scoringFormat: raw.scoring_settings ?? {},
    leagueType: detectLeagueType(raw),
    rosterSlots: raw.roster_positions ?? [],
    teamCount: raw.total_rosters,
    currentWeek,
    draftDate,
    draftStatus,
  };
}

function detectLeagueType(raw: SleeperLeague): League['leagueType'] {
  if (raw.settings.best_ball === 1) return 'bestball';
  switch (raw.settings.type) {
    case 2:
      return 'dynasty';
    case 1:
      return 'keeper';
    default:
      return 'redraft';
  }
}

export function mapTeams(rosters: SleeperRoster[], users: SleeperLeagueUser[]): Team[] {
  const usersById = new Map(users.map((u) => [u.user_id, u]));
  return rosters.map((r) => {
    const owner = r.owner_id ? usersById.get(r.owner_id) : undefined;
    const s = r.settings;
    return {
      externalTeamId: String(r.roster_id),
      ownerExternalUserId: r.owner_id ?? '',
      displayName: owner?.metadata?.team_name ?? owner?.display_name ?? `Roster ${r.roster_id}`,
      wins: s?.wins ?? 0,
      losses: s?.losses ?? 0,
      ties: s?.ties ?? 0,
      pointsFor: combinePoints(s?.fpts, s?.fpts_decimal),
      pointsAgainst: combinePoints(s?.fpts_against, s?.fpts_against_decimal),
    };
  });
}

/** Sleeper splits fractional points into whole + hundredths fields. */
function combinePoints(whole?: number, decimal?: number): number {
  return (whole ?? 0) + (decimal ?? 0) / 100;
}

/**
 * `starterSlotTypes` is the league's starter-slot list (e.g. ['QB','RB','RB','FLEX']),
 * in the same order Sleeper uses for `raw.starters` — so `starters[i]` fills
 * `starterSlotTypes[i]`. That lets us label which specific slot each starter
 * occupies instead of just bucketing them as "starter".
 */
export function mapRoster(raw: SleeperRoster, starterSlotTypes: string[]): Roster {
  // starters is slot-ordered; '0' marks an empty slot
  const rawStarters = raw.starters ?? [];
  const starterIds = rawStarters.filter((id) => id !== '0' && id !== '');
  const reserve = raw.reserve ?? [];
  const taxi = raw.taxi ?? [];
  const excluded = new Set([...starterIds, ...reserve, ...taxi]);
  const bench = (raw.players ?? []).filter((id) => !excluded.has(id));

  const entries: RosterEntry[] = [
    ...rawStarters.flatMap((id, i): RosterEntry[] =>
      id === '0' || id === ''
        ? []
        : [{ externalPlayerId: id, slot: 'starter', positionSlot: starterSlotTypes[i] ?? null }],
    ),
    ...bench.map((id): RosterEntry => ({ externalPlayerId: id, slot: 'bench', positionSlot: null })),
    ...reserve.map((id): RosterEntry => ({ externalPlayerId: id, slot: 'ir', positionSlot: null })),
    ...taxi.map((id): RosterEntry => ({ externalPlayerId: id, slot: 'taxi', positionSlot: null })),
  ];
  return { externalTeamId: String(raw.roster_id), entries };
}

export function mapMatchups(raw: SleeperMatchup[], week: number): Matchup[] {
  return raw.map((m) => {
    const opponent =
      m.matchup_id == null
        ? undefined
        : raw.find((o) => o.matchup_id === m.matchup_id && o.roster_id !== m.roster_id);
    return {
      week,
      externalTeamId: String(m.roster_id),
      opponentExternalTeamId: opponent ? String(opponent.roster_id) : null,
      points: m.points ?? 0,
      // Sleeper's matchup endpoint carries no projections and no kickoff data; the API
      // layer fills these in from rosters, projections and the NFL schedule.
      projectedPoints: null,
      anyStarterStarted: false,
      firstStarterKickoff: null,
      firstPlayerKickoff: null,
    };
  });
}

export function mapPlayer(externalPlayerId: string, raw: SleeperPlayer): Player {
  const assembled = [raw.first_name, raw.last_name].filter(Boolean).join(' ');
  return {
    externalPlayerId,
    fullName: raw.full_name ?? (assembled !== '' ? assembled : externalPlayerId),
    position: raw.position ?? 'UNK',
    nflTeam: raw.team ?? null,
    injuryStatus: normalizeInjuryStatus(raw.injury_status),
    byeWeek: raw.bye_week ?? null,
    projectedPoints: null,
  };
}

/** Uses PPR points as a fixed approximation — matching each league's exact scoring settings is future work. */
export function mapProjections(raw: SleeperProjectionsResponse): Map<string, number> {
  const projections = new Map<string, number>();
  for (const entry of raw) {
    if (typeof entry.stats.pts_ppr === 'number') {
      projections.set(entry.player_id, entry.stats.pts_ppr);
    }
  }
  return projections;
}

const STATUS_ACRONYMS = new Set(['IR', 'PUP', 'NA', 'COV', 'DNR']);

export function normalizeInjuryStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const upper = trimmed.toUpperCase();
  if (STATUS_ACRONYMS.has(upper)) return upper;
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const DRAFT_STATUSES = new Set<string>(['pre_draft', 'drafting', 'paused', 'complete']);

/** Sleeper's status strings match `DraftStatus` 1:1; anything unrecognized is treated as unknown. */
export function parseDraftStatus(raw: string | null | undefined): DraftStatus | null {
  return raw != null && DRAFT_STATUSES.has(raw) ? (raw as DraftStatus) : null;
}
const DRAFT_TYPES = new Set<string>(['snake', 'linear', 'auction']);

/**
 * `madePicks` comes from the picks endpoint — the draft object itself only reports
 * `last_picked`, so the pick count (and with it, who's on the clock) has to be passed in.
 */
export function mapDraft(raw: SleeperDraft, madePicks: number): Draft {
  const teamCount = raw.settings?.teams ?? Object.keys(raw.slot_to_roster_id ?? {}).length;
  const rounds = raw.settings?.rounds ?? 0;
  const status: DraftStatus = parseDraftStatus(raw.status) ?? 'pre_draft';
  const type: DraftType = raw.type && DRAFT_TYPES.has(raw.type) ? (raw.type as DraftType) : 'snake';
  const totalPicks = rounds * teamCount;

  const slotByTeamId: Record<string, number> = {};
  for (const [slot, rosterId] of Object.entries(raw.slot_to_roster_id ?? {})) {
    slotByTeamId[String(rosterId)] = Number(slot);
  }

  const running = status === 'drafting' || status === 'paused';
  const currentPickNo = running && madePicks < totalPicks ? madePicks + 1 : null;
  const slotOnTheClock =
    currentPickNo == null
      ? null
      : draftSlotForPick(currentPickNo, teamCount, type, raw.settings?.reversal_round ?? 0);
  const onTheClockTeamId =
    slotOnTheClock == null
      ? null
      : (Object.entries(slotByTeamId).find(([, slot]) => slot === slotOnTheClock)?.[0] ?? null);

  return {
    externalDraftId: raw.draft_id,
    externalLeagueId: raw.league_id ?? null,
    status,
    type,
    rounds,
    teamCount,
    startTime: raw.start_time != null ? new Date(raw.start_time).toISOString() : null,
    lastPickedAt: raw.last_picked != null ? new Date(raw.last_picked).toISOString() : null,
    slotByTeamId,
    totalPicks,
    madePicks,
    currentPickNo,
    onTheClockTeamId,
  };
}

/**
 * Board column for a pick number. Snake alternates each round; `reversalRound` (Sleeper's
 * 3rd-round reversal, 0 when off) flips the direction from that round onward, so with
 * reversal_round=3 the order runs 1..n, n..1, n..1, 1..n. Auction has no board order.
 */
export function draftSlotForPick(
  pickNo: number,
  teamCount: number,
  type: DraftType,
  reversalRound: number,
): number | null {
  if (type === 'auction' || teamCount <= 0) return null;
  const round = Math.ceil(pickNo / teamCount);
  const indexInRound = pickNo - (round - 1) * teamCount; // 1-based
  if (type === 'linear') return indexInRound;
  const reversed = reversalRound > 0 && round >= reversalRound ? round % 2 === 1 : round % 2 === 0;
  return reversed ? teamCount - indexInRound + 1 : indexInRound;
}

/**
 * `slotByTeamId` (from the draft) is the fallback for picks that carry no `roster_id` —
 * standalone mock drafts have no rosters, so the board column is the only team identity there.
 */
export function mapDraftPicks(raw: SleeperDraftPick[], slotByTeamId: Record<string, number>): DraftPick[] {
  const teamIdBySlot = new Map(Object.entries(slotByTeamId).map(([teamId, slot]) => [slot, teamId]));
  return [...raw]
    .sort((a, b) => a.pick_no - b.pick_no)
    .map((p) => {
      const meta = p.metadata;
      const assembled = [meta?.first_name, meta?.last_name].filter(Boolean).join(' ');
      return {
        pickNo: p.pick_no,
        round: p.round,
        slot: p.draft_slot,
        externalTeamId:
          p.roster_id != null
            ? String(p.roster_id)
            : (teamIdBySlot.get(p.draft_slot) ?? String(p.draft_slot)),
        externalPlayerId: p.player_id,
        playerName: assembled !== '' ? assembled : p.player_id,
        position: meta?.position ?? 'UNK',
        nflTeam: meta?.team && meta.team !== '' ? meta.team : null,
        isKeeper: p.is_keeper === true,
      };
    });
}
