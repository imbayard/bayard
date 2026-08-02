
import type { League, Matchup, Platform, Team } from '@benchpoints/core';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  fetchBenchIq,
  fetchLeagues,
  fetchMatchups,
  fetchRosters,
  fetchTeams,
  type BenchIqResponse,
} from './api';
import { useMockMode } from './mock-mode';

const MINUTE = 60_000;

export function leaguesQuery(mock: boolean) {
  return {
    queryKey: ['leagues', mock] as const,
    queryFn: () => fetchLeagues(mock),
    staleTime: 5 * MINUTE,
  };
}

export function useLeagues() {
  const [mock] = useMockMode();
  return useQuery(leaguesQuery(mock));
}

export function teamsQuery(platform: Platform, leagueId: string, mock: boolean) {
  return {
    queryKey: ['teams', platform, leagueId, mock] as const,
    queryFn: () => fetchTeams(platform, leagueId, mock),
    staleTime: 5 * MINUTE,
  };
}

export function useTeams(platform: Platform, leagueId: string) {
  const [mock] = useMockMode();
  return useQuery(teamsQuery(platform, leagueId, mock));
}

export function useRosters(platform: Platform, leagueId: string, season: number, week: number) {
  const [mock] = useMockMode();
  return useQuery({
    queryKey: ['rosters', platform, leagueId, season, week, mock],
    queryFn: () => fetchRosters(platform, leagueId, season, week, mock),
    staleTime: 5 * MINUTE,
  });
}

export function matchupsQuery(platform: Platform, leagueId: string, week: number, mock: boolean) {
  return {
    queryKey: ['matchups', platform, leagueId, week, mock] as const,
    queryFn: () => fetchMatchups(platform, leagueId, week, mock),
    staleTime: 0.5 * MINUTE,
  };
}

export function useMatchups(platform: Platform, leagueId: string, week: number) {
  const [mock] = useMockMode();
  return useQuery(matchupsQuery(platform, leagueId, week, mock));
}

export function benchIqQuery(platform: Platform, leagueId: string, mock: boolean) {
  return {
    queryKey: ['benchIq', platform, leagueId, mock] as const,
    queryFn: () => fetchBenchIq(platform, leagueId, mock),
    staleTime: 0.5 * MINUTE,
  };
}

export function useBenchIq(platform: Platform, leagueId: string) {
  const [mock] = useMockMode();
  return useQuery(benchIqQuery(platform, leagueId, mock));
}

/**
 * Everything a Command Deck module needs to summarize one league.
 * `myTeam`/`opponent` resolve via bench-iq's teamId (backend is canonical).
 */
export interface LeagueSummary {
  league: League;
  /** Still waiting on at least one of teams/matchups/bench-iq. */
  isLoading: boolean;
  /** Bench-iq or teams failed — flags/team unknown for this league. */
  isError: boolean;
  myTeam: Team | null;
  opponent: Team | null;
  myMatchup: Matchup | null;
  opponentMatchup: Matchup | null;
  benchIq: BenchIqResponse | null;
}

function summarize(
  league: League,
  teams: Team[] | undefined,
  matchups: Matchup[] | undefined,
  benchIq: BenchIqResponse | undefined,
  isLoading: boolean,
  isError: boolean,
): LeagueSummary {
  const myTeam =
    benchIq && teams ? (teams.find((t) => t.externalTeamId === benchIq.teamId) ?? null) : null;
  const myMatchup =
    benchIq && matchups
      ? (matchups.find((m) => m.externalTeamId === benchIq.teamId) ?? null)
      : null;
  const opponentMatchup =
    myMatchup?.opponentExternalTeamId != null && matchups
      ? (matchups.find((m) => m.externalTeamId === myMatchup.opponentExternalTeamId) ?? null)
      : null;
  const opponent =
    myMatchup?.opponentExternalTeamId != null && teams
      ? (teams.find((t) => t.externalTeamId === myMatchup.opponentExternalTeamId) ?? null)
      : null;

  return { league, isLoading, isError, myTeam, opponent, myMatchup, opponentMatchup, benchIq: benchIq ?? null };
}

/**
 * Per-league summaries for a set of leagues, fetched in parallel.
 * Query keys match the single-league hooks, so modules calling this
 * share the cache instead of refetching (allSettled semantics: one
 * failing league never blocks the others).
 */
export function useLeagueSummaries(leagues: League[]): LeagueSummary[] {
  const [mock] = useMockMode();
  const teamsResults = useQueries({
    queries: leagues.map((l) => teamsQuery(l.platform, l.externalLeagueId, mock)),
  });
  const matchupsResults = useQueries({
    queries: leagues.map((l) => matchupsQuery(l.platform, l.externalLeagueId, l.currentWeek, mock)),
  });
  const benchIqResults = useQueries({
    queries: leagues.map((l) => benchIqQuery(l.platform, l.externalLeagueId, mock)),
  });

  return leagues.map((league, i) => {
    const teams = teamsResults[i];
    const matchups = matchupsResults[i];
    const benchIq = benchIqResults[i];
    return summarize(
      league,
      teams.data,
      matchups.data,
      benchIq.data,
      teams.isPending || matchups.isPending || benchIq.isPending,
      teams.isError || benchIq.isError,
    );
  });
}
