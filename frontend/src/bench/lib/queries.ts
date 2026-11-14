
import type { DraftBoard, League, Matchup, Platform, Team, TradeMode } from '@benchpoints/core';
import { useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  fetchBenchIq,
  fetchDeck,
  fetchDraft,
  fetchMatchups,
  fetchRosters,
  fetchRooting,
  fetchScout,
  fetchTeams,
  fetchTrades,
  fetchWeather,
  type BenchIqResponse,
  type DeckResponse,
  type LeaguesResponse,
  type ScoutPool,
} from './api';
import { useMockMode } from './mock-mode';

const MINUTE = 60_000;

function summaryKey(league: League): string {
  return `${league.platform}:${league.externalLeagueId}`;
}

/**
 * The whole Command Deck in one request. Its staleTime is the shortest of its parts
 * (matchups, bench-iq), so nothing on home goes staler than when each was fetched alone.
 * Each league's parts are also written into the per-league query keys, so league detail
 * opens from cache.
 */
function deckQuery(mock: boolean, queryClient: QueryClient) {
  return {
    queryKey: ['deck', mock] as const,
    queryFn: async () => {
      const deck = await fetchDeck(mock);
      for (const l of deck.leagues) {
        const summary = deck.summaries[summaryKey(l)];
        if (!summary) continue;
        if (summary.teams) {
          queryClient.setQueryData(teamsQuery(l.platform, l.externalLeagueId, mock).queryKey, summary.teams);
        }
        if (summary.matchups) {
          const { queryKey } = matchupsQuery(l.platform, l.externalLeagueId, l.season, l.currentWeek, mock);
          queryClient.setQueryData(queryKey, summary.matchups);
        }
        if (summary.benchIq) {
          queryClient.setQueryData(benchIqQuery(l.platform, l.externalLeagueId, mock).queryKey, summary.benchIq);
        }
      }
      return deck;
    },
    staleTime: 0.5 * MINUTE,
  };
}

function useDeck() {
  const [mock] = useMockMode();
  return useQuery(deckQuery(mock, useQueryClient()));
}

const selectLeagues = (deck: DeckResponse): LeaguesResponse => ({
  leagues: deck.leagues,
  errors: deck.errors,
});

/** Read from the deck, so home's league list and its summaries arrive in one request. */
export function useLeagues() {
  const [mock] = useMockMode();
  return useQuery({ ...deckQuery(mock, useQueryClient()), select: selectLeagues });
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

export function matchupsQuery(
  platform: Platform,
  leagueId: string,
  season: number,
  week: number,
  mock: boolean,
) {
  return {
    queryKey: ['matchups', platform, leagueId, season, week, mock] as const,
    queryFn: () => fetchMatchups(platform, leagueId, season, week, mock),
    staleTime: 0.5 * MINUTE,
  };
}

export function useMatchups(platform: Platform, leagueId: string, season: number, week: number) {
  const [mock] = useMockMode();
  return useQuery(matchupsQuery(platform, leagueId, season, week, mock));
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

/** Live points move all game long; a minute of polling keeps the board honest while it's open. */
export function useRooting() {
  const [mock] = useMockMode();
  return useQuery({
    queryKey: ['rooting', mock],
    queryFn: () => fetchRooting(mock),
    staleTime: 0.5 * MINUTE,
    refetchInterval: MINUTE,
  });
}

/** Matches the client's draftPicks TTL — a live board is only ever ~10s stale. */
const DRAFT_POLL_MS = 10_000;

export function draftQuery(platform: Platform, leagueId: string, mock: boolean) {
  return {
    queryKey: ['draft', platform, leagueId, mock] as const,
    queryFn: () => fetchDraft(platform, leagueId, mock),
    staleTime: DRAFT_POLL_MS,
    // Poll only while picks are actually coming in.
    refetchInterval: (query: { state: { data?: DraftBoard } }) =>
      isDraftRunning(query.state.data) ? DRAFT_POLL_MS : false,
  };
}

function isDraftRunning(board: DraftBoard | undefined): boolean {
  return board?.draft.status === 'drafting' || board?.draft.status === 'paused';
}

export function useDraft(platform: Platform, leagueId: string) {
  const [mock] = useMockMode();
  return useQuery(draftQuery(platform, leagueId, mock));
}

/**
 * Opponent strength only moves when a week's games finish, so this can sit stale for a
 * good while — and the frame is part of the key, so changing it refetches rather than
 * re-rendering the previous frame's board.
 */
export function useScout(
  platform: Platform,
  leagueId: string,
  position: string,
  from: number,
  to: number,
  pool: ScoutPool,
) {
  const [mock] = useMockMode();
  return useQuery({
    queryKey: ['scout', platform, leagueId, position, from, to, pool, mock],
    queryFn: () => fetchScout(platform, leagueId, position, from, to, pool, mock),
    staleTime: 30 * MINUTE,
  });
}

/**
 * Rosters and values move daily at most, so a found set of trades can sit for a while; mode
 * and market are in the key, so flipping either refetches.
 */
export function useTrades(platform: Platform, leagueId: string, mode: TradeMode | undefined, market: boolean) {
  const [mock] = useMockMode();
  return useQuery({
    queryKey: ['trades', platform, leagueId, mode ?? 'suggested', market, mock],
    queryFn: () => fetchTrades(platform, leagueId, mode, market, mock),
    staleTime: 30 * MINUTE,
  });
}

/**
 * Matches the server's game-week cache tier: forecasts refresh roughly hourly, so a half hour
 * of staleness costs nothing. Not league-scoped — every league's roster shares one fetch.
 */
export function useWeather(season: number, week: number) {
  const [mock] = useMockMode();
  return useQuery({
    queryKey: ['weather', season, week, mock],
    queryFn: () => fetchWeather(season, week, mock),
    staleTime: 30 * MINUTE,
  });
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
 * Per-league summaries, read from the deck. A league the deck didn't cover (shouldn't happen)
 * falls back to the per-league queries — same keys the single-league hooks use, so they share
 * the cache. One failing league never blocks the others.
 */
export function useLeagueSummaries(leagues: League[]): LeagueSummary[] {
  const [mock] = useMockMode();
  const deck = useDeck();
  const fromDeck = (l: League) => deck.data?.summaries[summaryKey(l)];
  const needsFallback = (l: League) => deck.isSuccess && !fromDeck(l);

  const teamsResults = useQueries({
    queries: leagues.map((l) => ({
      ...teamsQuery(l.platform, l.externalLeagueId, mock),
      enabled: needsFallback(l),
    })),
  });
  const matchupsResults = useQueries({
    queries: leagues.map((l) => ({
      ...matchupsQuery(l.platform, l.externalLeagueId, l.season, l.currentWeek, mock),
      enabled: needsFallback(l),
    })),
  });
  const benchIqResults = useQueries({
    queries: leagues.map((l) => ({
      ...benchIqQuery(l.platform, l.externalLeagueId, mock),
      enabled: needsFallback(l),
    })),
  });

  return leagues.map((league, i) => {
    const summary = fromDeck(league);
    if (summary) {
      return summarize(
        league,
        summary.teams ?? undefined,
        summary.matchups ?? undefined,
        summary.benchIq ?? undefined,
        false,
        summary.teams === null || summary.benchIq === null,
      );
    }
    if (!deck.isSuccess) {
      return summarize(league, undefined, undefined, undefined, deck.isPending, deck.isError);
    }

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
