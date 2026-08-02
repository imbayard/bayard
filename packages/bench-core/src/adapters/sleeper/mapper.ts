import type { League, Matchup, Player, Roster, RosterEntry, Team } from '../../types/league.js';
import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperPlayer,
  SleeperProjectionsResponse,
  SleeperRoster,
} from './types.js';

export function mapLeague(raw: SleeperLeague, currentWeek: number): League {
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
      projectedPoints: null, // Sleeper's matchup endpoint carries no projections
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
