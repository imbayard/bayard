import { Hono } from 'hono';
import { adapterFor } from '../adapters.js';
import { isMockRequested } from '../lib/mock.js';
import { parsePlatform } from '../lib/platform.js';

export const matchups = new Hono();

matchups.get('/leagues/:platform/:leagueId/matchups/:week', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const leagueId = c.req.param('leagueId');
  const week = Number(c.req.param('week'));

  const adapter = adapterFor(platform, isMockRequested(c));
  const result = await adapter.getMatchups(leagueId, week);
  return c.json(result);
});
