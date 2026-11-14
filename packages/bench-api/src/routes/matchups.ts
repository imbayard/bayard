import { Hono } from 'hono';
import { env } from '../env.js';
import { enrichedMatchups } from '../lib/matchups.js';
import { isMockRequested } from '../lib/mock.js';
import { parsePlatform } from '../lib/platform.js';

export const matchups = new Hono();

matchups.get('/leagues/:platform/:leagueId/matchups/:week', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const leagueId = c.req.param('leagueId');
  const week = Number(c.req.param('week'));
  const season = Number(c.req.query('season') ?? env.espnSeason);
  return c.json(await enrichedMatchups(platform, leagueId, season, week, isMockRequested(c)));
});
