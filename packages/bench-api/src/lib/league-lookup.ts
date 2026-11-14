import type { League } from '@benchpoints/core';
import { MOCK_ESPN_OWNER_ID, MOCK_SLEEPER_OWNER_ID } from '@benchpoints/core';
import { AdapterNotConfiguredError, sleeperAdapter } from '../adapters.js';
import { env } from '../env.js';
import { getEspnLeagues, getSleeperLeagues } from '../routes/leagues.js';
import type { Platform } from '@benchpoints/core';

/** A league plus the id of the owner whose team we're reporting on. */
export interface LeagueLookup {
  league: League;
  ownerExternalUserId: string;
}

/**
 * Lists the owner's leagues the same way `/leagues` does and picks one. A prior-season id
 * still resolves (an old link, or the league list rolled over), so that fallback stays.
 */
async function findSleeperLeague(leagueId: string, useMock: boolean): Promise<LeagueLookup | undefined> {
  const [leagues, ownerExternalUserId] = await Promise.all([
    getSleeperLeagues(useMock),
    resolveOwnerId('sleeper', useMock),
  ]);
  let league = leagues.find((l) => l.externalLeagueId === leagueId);
  if (!league && !useMock && leagues.length > 0) {
    const priorSeason = leagues[0]!.season - 1;
    const prior = await sleeperAdapter.getLeagues(ownerExternalUserId, priorSeason);
    league = prior.find((l) => l.externalLeagueId === leagueId);
  }
  return league ? { league, ownerExternalUserId } : undefined;
}

async function findEspnLeague(leagueId: string, useMock: boolean): Promise<LeagueLookup | undefined> {
  const [leagues, ownerExternalUserId] = await Promise.all([
    getEspnLeagues(useMock),
    resolveOwnerId('espn', useMock),
  ]);
  const league = leagues.find((l) => l.externalLeagueId === leagueId);
  return league ? { league, ownerExternalUserId } : undefined;
}

/**
 * The owner id for a platform on its own, without a specific league to filter to — for
 * callers (the digest) that already have every league and just need whose team to match.
 */
export function resolveOwnerId(platform: Platform, useMock: boolean): Promise<string> {
  if (platform === 'sleeper') {
    if (useMock) return Promise.resolve(MOCK_SLEEPER_OWNER_ID);
    if (!env.sleeperUsername) throw new AdapterNotConfiguredError('sleeper');
    return sleeperAdapter.resolveUserId(env.sleeperUsername);
  }
  return Promise.resolve(useMock ? MOCK_ESPN_OWNER_ID : (env.espnSwid ?? ''));
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
