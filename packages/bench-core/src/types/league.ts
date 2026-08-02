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
