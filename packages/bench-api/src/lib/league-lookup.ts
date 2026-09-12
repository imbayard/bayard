import type { League } from '@benchpoints/core';
import { MOCK_ESPN_OWNER_ID, MOCK_SLEEPER_OWNER_ID } from '@benchpoints/core';
import { AdapterNotConfiguredError, adapterFor, sleeperAdapter } from '../adapters.js';
import { env } from '../env.js';
import type { Platform } from '@benchpoints/core';

/** A league plus the id of the owner whose team we're reporting on. */
export interface LeagueLookup {
  league: League;
  ownerExternalUserId: string;
}

async function findSleeperLeague(leagueId: string, useMock: boolean): Promise<LeagueLookup | undefined> {
  if (useMock) {
    const leagues = await adapterFor('sleeper', true).getLeagues(MOCK_SLEEPER_OWNER_ID, env.espnSeason);
    const league = leagues.find((l) => l.externalLeagueId === leagueId);
    return league ? { league, ownerExternalUserId: MOCK_SLEEPER_OWNER_ID } : undefined;
  }

  if (!env.sleeperUsername) {
    throw new AdapterNotConfiguredError('sleeper');
  }
  const userId = await sleeperAdapter.resolveUserId(env.sleeperUsername);
  const state = await sleeperAdapter.getNflState();
  const stateSeason = Number(state.league_season ?? state.season);

  let leagues = await sleeperAdapter.getLeagues(userId, stateSeason);
  let league = leagues.find((l) => l.externalLeagueId === leagueId);
  if (!league) {
    leagues = await sleeperAdapter.getLeagues(userId, stateSeason - 1);
    league = leagues.find((l) => l.externalLeagueId === leagueId);
  }
  return league ? { league, ownerExternalUserId: userId } : undefined;
}

async function findEspnLeague(leagueId: string, useMock: boolean): Promise<LeagueLookup | undefined> {
  const ownerExternalUserId = useMock ? MOCK_ESPN_OWNER_ID : (env.espnSwid ?? '');
  const leagues = await adapterFor('espn', useMock).getLeagues(ownerExternalUserId, env.espnSeason);
  const league = leagues.find((l) => l.externalLeagueId === leagueId);
  return league ? { league, ownerExternalUserId } : undefined;
}

/**
 * Resolves one of the owner's leagues by id. Neither platform has a "get league by id"
 * call that also tells us which team is ours, so both paths list the owner's leagues and
 * pick from them — which is also what makes a league we don't own a 404 rather than a leak.
 */
export function findLeague(
  platform: Platform,
  leagueId: string,
  useMock: boolean,
): Promise<LeagueLookup | undefined> {
  return platform === 'sleeper'
    ? findSleeperLeague(leagueId, useMock)
    : findEspnLeague(leagueId, useMock);
}
