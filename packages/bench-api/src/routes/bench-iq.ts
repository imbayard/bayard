// Relative import (see adapters.ts) — avoids Netlify's workspace-package externalization bug.
import type { League } from '../../../bench-core/dist/index.js';
import { computeBenchIqFlags, MOCK_ESPN_OWNER_ID, MOCK_SLEEPER_OWNER_ID } from '../../../bench-core/dist/index.js';
import { Hono } from 'hono';
import { AdapterNotConfiguredError, adapterFor, sleeperAdapter } from '../adapters.js';
import { env } from '../env.js';
import { isMockRequested } from '../lib/mock.js';
import { parsePlatform } from '../lib/platform.js';

export const benchIq = new Hono();

interface LeagueLookup {
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

benchIq.get('/leagues/:platform/:leagueId/bench-iq', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const leagueId = c.req.param('leagueId');
  const useMock = isMockRequested(c);
  const adapter = adapterFor(platform, useMock);

  const lookup =
    platform === 'sleeper' ? await findSleeperLeague(leagueId, useMock) : await findEspnLeague(leagueId, useMock);
  if (!lookup) {
    return c.json({ error: `League "${leagueId}" not found` }, 404);
  }
  const { league, ownerExternalUserId } = lookup;

  const [teams, rosters, players, projections] = await Promise.all([
    adapter.getTeams(leagueId),
    adapter.getRosters(leagueId),
    adapter.getPlayers(),
    adapter.getProjections(league.season, league.currentWeek),
  ]);
  for (const [playerId, projectedPoints] of projections) {
    const player = players.get(playerId);
    if (player) player.projectedPoints = projectedPoints;
  }

  const myTeam = teams.find(
    (t) => t.ownerExternalUserId.toLowerCase() === ownerExternalUserId.toLowerCase(),
  );
  const roster = myTeam
    ? rosters.find((r) => r.externalTeamId === myTeam.externalTeamId)
    : undefined;
  if (!roster) {
    return c.json({ error: `Could not find your team in league "${leagueId}"` }, 404);
  }

  const rosteredPlayerIds = new Set(rosters.flatMap((r) => r.entries.map((e) => e.externalPlayerId)));
  const flags = computeBenchIqFlags(roster, players, league.currentWeek, league.rosterSlots, rosteredPlayerIds);
  return c.json({ flags, week: league.currentWeek, teamId: roster.externalTeamId });
});
