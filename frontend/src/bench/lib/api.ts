import type {
  BenchIqFlag,
  League,
  Matchup,
  Platform,
  Player,
  Roster,
  RosterEntry,
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
}

export type EnrichedRosterEntry = RosterEntry & { player: Player | null };

export type EnrichedRoster = Omit<Roster, 'entries'> & {
  entries: EnrichedRosterEntry[];
};

async function get<T>(path: string, mock: boolean): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
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
    throw new Error(`GET ${path} failed (${res.status})${detail}`);
  }
  return res.json() as Promise<T>;
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
  week: number,
  mock: boolean,
): Promise<Matchup[]> {
  return get(`/leagues/${platform}/${leagueId}/matchups/${week}`, mock);
}

export function fetchBenchIq(
  platform: Platform,
  leagueId: string,
  mock: boolean,
): Promise<BenchIqResponse> {
  return get(`/leagues/${platform}/${leagueId}/bench-iq`, mock);
}
