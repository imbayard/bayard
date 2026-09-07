export type Platform = 'sleeper' | 'espn';

export interface League {
  platform: Platform;
  externalLeagueId: string;
  name: string;
  season: number;
  /** Raw scoring rules keyed by stat, e.g. { rec: 1, pass_td: 4 } */
  scoringFormat: Record<string, number>;
  leagueType: 'redraft' | 'dynasty' | 'keeper' | 'bestball';
  /** e.g. ['QB','RB','RB','WR','WR','TE','FLEX','K','DEF','BN',...] */
  rosterSlots: string[];
  teamCount: number;
  currentWeek: number;
  /** ISO 8601 timestamp of the league's draft, or null if unscheduled/unknown. */
  draftDate: string | null;
  /** Where the league's draft stands, or null when the platform doesn't report one. */
  draftStatus: DraftStatus | null;
}

export interface Team {
  externalTeamId: string;
  ownerExternalUserId: string;
  displayName: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
}

export interface RosterEntry {
  externalPlayerId: string;
  slot: 'starter' | 'bench' | 'ir' | 'taxi';
  /** Specific slot label a starter occupies (e.g. 'RB', 'FLEX'); null for bench/ir/taxi or when unknown. */
  positionSlot?: string | null;
}

export interface Roster {
  externalTeamId: string;
  entries: RosterEntry[];
}

export interface Matchup {
  week: number;
  externalTeamId: string;
  /** null on bye */
  opponentExternalTeamId: string | null;
  points: number;
  projectedPoints: number | null;
}

export interface Player {
  externalPlayerId: string;
  fullName: string;
  /** QB, RB, WR, TE, K, DEF */
  position: string;
  nflTeam: string | null;
  /** 'Questionable' | 'Out' | 'IR' | 'Doubtful' | null */
  injuryStatus: string | null;
  byeWeek: number | null;
  /** Projected fantasy points for the current week; null when no projection is available. */
  projectedPoints: number | null;
}

export type DraftStatus = 'pre_draft' | 'drafting' | 'paused' | 'complete';

export type DraftType = 'snake' | 'linear' | 'auction';

export interface Draft {
  externalDraftId: string;
  /** Null for standalone mock drafts, which belong to no league. */
  externalLeagueId: string | null;
  status: DraftStatus;
  type: DraftType;
  rounds: number;
  teamCount: number;
  /** ISO 8601 scheduled start, or null if unscheduled. */
  startTime: string | null;
  /** ISO 8601 timestamp of the most recent pick; null before the draft starts. */
  lastPickedAt: string | null;
  /** externalTeamId -> board column (1-based). Empty until the draft order is set. */
  slotByTeamId: Record<string, number>;
  totalPicks: number;
  madePicks: number;
  /** 1-based pick currently on the clock; null unless the draft is running. */
  currentPickNo: number | null;
  /** Team on the clock; null unless the draft is running, or when the order is unknown. */
  onTheClockTeamId: string | null;
}

export interface DraftPick {
  /** 1-based, across the whole draft */
  pickNo: number;
  round: number;
  /** Board column (1-based) */
  slot: number;
  externalTeamId: string;
  externalPlayerId: string;
  /** Denormalized off the pick itself, so a board renders without the full player map. */
  playerName: string;
  position: string;
  nflTeam: string | null;
  isKeeper: boolean;
}

/** A draft plus every pick made so far — what the draft board renders from. */
export interface DraftBoard {
  draft: Draft;
  /** Ascending by pickNo. Empty before the draft starts. */
  picks: DraftPick[];
}
