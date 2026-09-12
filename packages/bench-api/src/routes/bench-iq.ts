import { computeBenchIqFlags } from '@benchpoints/core';
import { Hono } from 'hono';
import { adapterFor } from '../adapters.js';
import { findLeague } from '../lib/league-lookup.js';
import { isMockRequested } from '../lib/mock.js';
import { parsePlatform } from '../lib/platform.js';
import { sumStarterProjections } from '../lib/projections.js';

export const benchIq = new Hono();

benchIq.get('/leagues/:platform/:leagueId/bench-iq', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const leagueId = c.req.param('leagueId');
  const useMock = isMockRequested(c);
  const adapter = adapterFor(platform, useMock);

  const lookup = await findLeague(platform, leagueId, useMock);
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

  return c.json({
    flags,
    week: league.currentWeek,
    teamId: roster.externalTeamId,
    rosterCount: roster.entries.length,
    projectedPoints: sumStarterProjections(roster, players),
  });
});
