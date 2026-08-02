/** Raw ESPN API response shapes (partial — only fields we consume). */

export interface EspnTeam {
  id: number;
  abbrev: string;
  name: string;
  record?: {
    wins: number;
    losses: number;
    ties?: number;
  };
  owners?: Array<{ id: string }>;
}

export interface EspnRosterEntry {
  playerId: number;
  status: string; // 'ACTIVE', 'BENCH', 'IR', etc.
  lineupSlotId: number;
}

export interface EspnRoster {
  entries: EspnRosterEntry[];
}

export interface EspnTeamRecordSplit {
  wins: number;
  losses: number;
  ties?: number;
  pointsFor?: number;
  pointsAgainst?: number;
}

export interface EspnTeamDetail {
  id: number;
  abbrev: string;
  name: string;
  /** ESPN nests the standings under `record.overall` (plus home/away/division splits). */
  record?: {
    overall?: EspnTeamRecordSplit;
  };
  /** Season points-for total (the reliable source; the record splits report 0 in some leagues). */
  points?: number;
  roster?: EspnRoster;
  owners?: Array<{ id: string }>;
}

export interface EspnProPlayer {
  id: number;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  proTeamId: number;
  /** Numeric position id (see POSITION_BY_ID); ESPN does NOT return a position string. */
  defaultPositionId: number;
  injuryStatus?: string;
  stats?: EspnPlayerStat[];
}

/**
 * The `/players?view=kona_player_info` endpoint returns a BARE ARRAY of player objects
 * (no `{ players: [{ player }] }` wrapper — that shape is only used by the league endpoint).
 */
export type EspnPlayerPool = EspnProPlayer[];

export interface EspnPlayerStat {
  id: string;
  seasonId: number;
  scoringPeriodId: number;
  statSourceId: number; // 0 = actual, 1 = projected
  statSplitTypeId: number; // 0 = season total, 1 = single week
  appliedTotal?: number;
  appliedAverage?: number;
  stats?: Record<string, number>;
}

export interface EspnPlayerInfoResponse {
  players: Array<{ id: number; player: EspnProPlayer }>;
}

export interface EspnMatchup {
  id: number;
  matchupPeriodId: number;
  away: {
    teamId: number;
    points: number;
  };
  home: {
    teamId: number;
    points: number;
  };
}

export interface EspnScoringItem {
  statId: number;
  points: number;
  /** Position-specific overrides keyed by lineup slot id (e.g. TE-premium), when present. */
  pointsOverrides?: Record<string, number>;
}

export interface EspnLeagueSettings {
  /** ESPN nests the scoring rules under `scoringItems` — `scoringSettings` itself is an object, not iterable. */
  scoringSettings: {
    scoringItems: EspnScoringItem[];
  };
  rosterSettings: {
    lineupSlotCounts: Record<number, number>;
  };
  keeperCount?: number;
}

export interface EspnLeagueResponse {
  id: number;
  name: string;
  season: number;
  scoringPeriodId: number;
  status: {
    latestScoringPeriod: number;
  };
  teams?: EspnTeamDetail[];
  schedule?: EspnMatchup[];
  settings?: EspnLeagueSettings;
}
