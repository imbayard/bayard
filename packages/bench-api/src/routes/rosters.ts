import { Hono } from 'hono';
import { adapterFor } from '../adapters.js';
import { isMockRequested } from '../lib/mock.js';
import { parsePlatform } from '../lib/platform.js';

export const rosters = new Hono();

rosters.get('/leagues/:platform/:leagueId/rosters', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const leagueId = c.req.param('leagueId');
  const adapter = adapterFor(platform, isMockRequested(c));
  const season = c.req.query('season');
  const week = c.req.query('week');

  const [leagueRosters, players, projections] = await Promise.all([
    adapter.getRosters(leagueId),
    adapter.getPlayers(),
    season && week ? adapter.getProjections(Number(season), Number(week)) : Promise.resolve(new Map()),
  ]);
  for (const [playerId, projectedPoints] of projections) {
    const player = players.get(playerId);
    if (player) player.projectedPoints = projectedPoints;
  }

  const enriched = leagueRosters.map((roster) => ({
    ...roster,
    entries: roster.entries.map((entry) => ({
      ...entry,
      player: players.get(entry.externalPlayerId) ?? null,
    })),
  }));

  return c.json(enriched);
});
