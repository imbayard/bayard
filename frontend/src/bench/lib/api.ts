import type {
  BenchIqFlag,
  DraftBoard,
  League,
  Matchup,
  Platform,
  Player,
  Roster,
  RosterEntry,
  ScoutCandidate,
  Team,
} from '@benchpoints/core';

// Same-origin: the bench Netlify Function is bound to /api/bench/* on this site.
const API_URL = '/api/bench';

export interface PlatformError {
  platform: Platform;
  error: string;
}

export interface LeaguesResponse {
  leagues: League[];
  errors: PlatformError[];
}

export interface BenchIqResponse {
  flags: BenchIqFlag[];
  week: number;
  /** The caller's own team in this league — canonical "my team" id. */
  teamId: string;
  /** Players on that team's roster, starters and bench alike. 0 before the draft. */
  rosterCount: number;
  /** This week's starters' projections, summed; null when no starter has a projection. */
  projectedPoints: number | null;
}

/** Which players a scout report ranks: everyone unrostered, or just the ones you own. */
export type ScoutPool = 'waivers' | 'roster';

export interface ScoutResponse {
  position: string;
  weeks: number[];
  pool: ScoutPool;
  /** Sorted by frame score, best matchups first. */
  candidates: ScoutCandidate[];
  meta: {
    season: number;
    currentWeek: number;
    /** Last week of results the opponent ratings are built from. */
    statsThroughWeek: number;
    /** How much of those ratings came from last season, 0-1. */
    priorSeasonWeight: number;
  };
}

export type EnrichedRosterEntry = RosterEntry & { player: Player | null };

export type EnrichedRoster = Omit<Roster, 'entries'> & {
  entries: EnrichedRosterEntry[];
};

async function request<T>(method: string, path: string, mock: boolean): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { 'x-bp-mock': mock ? '1' : '0' },
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detail = `: ${body.error}`;
    } catch {
      // non-JSON error body; status alone is enough
    }
    throw new Error(`${method} ${path} failed (${res.status})${detail}`);
  }
  return res.json() as Promise<T>;
}

function get<T>(path: string, mock: boolean): Promise<T> {
  return request<T>('GET', path, mock);
}

function post<T>(path: string, mock: boolean): Promise<T> {
  return request<T>('POST', path, mock);
}

export function fetchLeagues(mock: boolean): Promise<LeaguesResponse> {
  return get('/leagues', mock);
}

export function fetchTeams(platform: Platform, leagueId: string, mock: boolean): Promise<Team[]> {
  return get(`/leagues/${platform}/${leagueId}/teams`, mock);
}

export function fetchRosters(
  platform: Platform,
  leagueId: string,
  season: number,
  week: number,
  mock: boolean,
): Promise<EnrichedRoster[]> {
  return get(`/leagues/${platform}/${leagueId}/rosters?season=${season}&week=${week}`, mock);
}

export function fetchMatchups(
  platform: Platform,
  leagueId: string,
  season: number,
  week: number,
  mock: boolean,
): Promise<Matchup[]> {
  return get(`/leagues/${platform}/${leagueId}/matchups/${week}?season=${season}`, mock);
}

export function fetchBenchIq(
  platform: Platform,
  leagueId: string,
  mock: boolean,
): Promise<BenchIqResponse> {
  return get(`/leagues/${platform}/${leagueId}/bench-iq`, mock);
}

export function scheduleDraft(
  platform: Platform,
  leagueId: string,
  mock: boolean,
): Promise<{ id: string }> {
  return post(`/leagues/${platform}/${leagueId}/schedule-draft`, mock);
}

/**
 * The league's most recent draft and every pick made so far. 404s when the league has
 * no draft, and 400s for platforms with no draft support (ESPN today).
 */
export function fetchDraft(platform: Platform, leagueId: string, mock: boolean): Promise<DraftBoard> {
  return get(`/leagues/${platform}/${leagueId}/draft`, mock);
}

/**
 * Best matchups over a frame of weeks, for the given position and pool.
 * The API caps a frame at six weeks and 400s anything wider.
 */
export function fetchScout(
  platform: Platform,
  leagueId: string,
  position: string,
  from: number,
  to: number,
  pool: ScoutPool,
  mock: boolean,
): Promise<ScoutResponse> {
  const query = new URLSearchParams({ position, from: String(from), to: String(to), pool });
  return get(`/leagues/${platform}/${leagueId}/scout?${query}`, mock);
}
