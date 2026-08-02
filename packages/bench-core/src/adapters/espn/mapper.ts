import type {
  League,
  Matchup,
  Player,
  Roster,
  RosterEntry,
  Team,
} from '../../types/league.js';
import type {
  EspnLeagueResponse,
  EspnPlayerInfoResponse,
  EspnProPlayer,
  EspnTeamDetail,
} from './types.js';
import {
  INJURY_STATUS_MAP,
  LINEUP_SLOT_MAP,
  NFL_TEAM_BY_ID,
  POSITION_BY_ID,
} from './constants.js';

export function mapLeague(raw: EspnLeagueResponse): League {
  // ESPN keys scoring rules by numeric statId under scoringSettings.scoringItems
  // (scoringSettings itself is an object, not an array — iterating it directly throws).
  const scoringFormat: Record<string, number> = {};
  const scoringItems = raw.settings?.scoringSettings?.scoringItems;
  if (Array.isArray(scoringItems)) {
    for (const item of scoringItems) {
      scoringFormat[String(item.statId)] = item.points;
    }
  }

  const leagueType = detectLeagueType(raw);
  const currentWeek = raw.scoringPeriodId || 1;

  return {
    platform: 'espn',
    externalLeagueId: String(raw.id),
    name: raw.name,
    season: raw.season,
    scoringFormat,
    leagueType,
    rosterSlots: expandRosterSlots(raw.settings?.rosterSettings.lineupSlotCounts ?? {}),
    teamCount: raw.teams?.length ?? 0,
    currentWeek,
  };
}

function detectLeagueType(raw: EspnLeagueResponse): League['leagueType'] {
  const keeperCount = raw.settings?.keeperCount ?? 0;
  if (keeperCount > 0) return 'keeper';
  // TODO: detect dynasty via settings when available
  return 'redraft';
}

function expandRosterSlots(lineupSlotCounts: Record<number, number>): string[] {
  const slots: string[] = [];
  const sortedIds = Object.keys(lineupSlotCounts)
    .map(Number)
    .sort((a, b) => a - b);

  for (const id of sortedIds) {
    const count = lineupSlotCounts[id]!;
    const slot = LINEUP_SLOT_MAP[id] ?? `UNKNOWN_${id}`;
    for (let i = 0; i < count; i++) {
      slots.push(slot);
    }
  }
  return slots;
}

export function mapTeams(teams: EspnTeamDetail[]): Team[] {
  return teams.map((t) => {
    const record = t.record?.overall;
    const ownerSwid = t.owners?.[0]?.id ?? '';

    return {
      externalTeamId: String(t.id),
      ownerExternalUserId: ownerSwid,
      displayName: t.name,
      wins: record?.wins ?? 0,
      losses: record?.losses ?? 0,
      ties: record?.ties ?? 0,
      pointsFor: t.points ?? record?.pointsFor ?? 0,
      pointsAgainst: record?.pointsAgainst ?? 0,
    };
  });
}

export function mapRoster(team: EspnTeamDetail, leagueRosterSlots: string[]): Roster {
  const entries: RosterEntry[] = [];
  const roster = team.roster?.entries ?? [];

  for (const entry of roster) {
    const slot = LINEUP_SLOT_MAP[entry.lineupSlotId] ?? `UNKNOWN_${entry.lineupSlotId}`;
    let rosterSlot: RosterEntry['slot'] = 'bench';
    let positionSlot: string | null = null;

    if (slot === 'BN') {
      rosterSlot = 'bench';
    } else if (slot === 'IR') {
      rosterSlot = 'ir';
    } else {
      // Starter position — lineupSlotId already resolves the specific slot (e.g. 'RB', 'FLEX').
      rosterSlot = 'starter';
      positionSlot = slot;
    }

    entries.push({
      externalPlayerId: String(entry.playerId),
      slot: rosterSlot,
      positionSlot,
    });
  }

  return {
    externalTeamId: String(team.id),
    entries,
  };
}

export function mapMatchups(raw: EspnLeagueResponse, week: number): Matchup[] {
  const result: Matchup[] = [];
  const matchups = raw.schedule ?? [];

  for (const matchup of matchups) {
    if (matchup.matchupPeriodId !== week) continue;

    result.push({
      week,
      externalTeamId: String(matchup.away.teamId),
      opponentExternalTeamId: String(matchup.home.teamId),
      points: matchup.away.points,
      projectedPoints: null,
    });

    result.push({
      week,
      externalTeamId: String(matchup.home.teamId),
      opponentExternalTeamId: String(matchup.away.teamId),
      points: matchup.home.points,
      projectedPoints: null,
    });
  }

  return result;
}

export function mapPlayer(espnId: number, raw: EspnProPlayer): Player {
  const fullName =
    raw.fullName || [raw.firstName, raw.lastName].filter(Boolean).join(' ') || String(espnId);

  const nflTeamId = raw.proTeamId;
  const nflTeam = NFL_TEAM_BY_ID[nflTeamId] ?? null;

  const injuryStatusRaw = raw.injuryStatus?.toLowerCase() ?? null;
  let injuryStatus: string | null = null;
  if (injuryStatusRaw) {
    injuryStatus = INJURY_STATUS_MAP[injuryStatusRaw] ?? normalizeInjuryStatus(injuryStatusRaw);
  }

  return {
    externalPlayerId: String(espnId),
    fullName,
    position: POSITION_BY_ID[raw.defaultPositionId] ?? 'UNK',
    nflTeam,
    injuryStatus,
    // ESPN doesn't expose bye weeks on the player object (they live on the pro-team schedule);
    // always null for now, which means BYE_WEEK_STARTER can't fire for ESPN yet.
    byeWeek: null,
    projectedPoints: null,
  };
}

/**
 * Weekly projected points, keyed by ESPN player id. ESPN pre-applies the league's scoring
 * settings server-side, so `appliedTotal` on the projected entry (statSourceId 1) is already
 * league-scored — no scoring engine needed. Mirrors Sleeper's mapProjections.
 */
export function mapProjections(raw: EspnPlayerInfoResponse, week: number): Map<string, number> {
  const projections = new Map<string, number>();
  for (const wrap of raw.players ?? []) {
    const p = wrap.player;
    if (!p) continue;
    const entry = (p.stats ?? []).find(
      (s) => s.statSourceId === 1 && s.scoringPeriodId === week && typeof s.appliedTotal === 'number',
    );
    if (entry && typeof entry.appliedTotal === 'number') {
      projections.set(String(p.id), entry.appliedTotal);
    }
  }
  return projections;
}

export function normalizeInjuryStatus(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  return trimmed
    .split(/[\s_]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
