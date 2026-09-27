import { Hono } from 'hono';
import { computeLeagueBenchIq } from '../lib/bench-iq.js';
import { findLeague } from '../lib/league-lookup.js';
import { isMockRequested } from '../lib/mock.js';
import { parsePlatform } from '../lib/platform.js';

export const benchIq = new Hono();

benchIq.get('/leagues/:platform/:leagueId/bench-iq', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const leagueId = c.req.param('leagueId');
  const useMock = isMockRequested(c);

  const lookup = await findLeague(platform, leagueId, useMock);
  if (!lookup) {
    return c.json({ error: `League "${leagueId}" not found` }, 404);
  }

  const result = await computeLeagueBenchIq(platform, lookup.league, lookup.ownerExternalUserId, useMock);
  if (!result) {
    return c.json({ error: `Could not find your team in league "${leagueId}"` }, 404);
  }
  return c.json(result.summary);
});
