// Relative import (see adapters.ts) — avoids Netlify's workspace-package externalization bug.
import type { League } from '../../../bench-core/dist/index.js';
import { MOCK_ESPN_OWNER_ID, MOCK_SLEEPER_OWNER_ID } from '../../../bench-core/dist/index.js';
import { Hono } from 'hono';
import { AdapterNotConfiguredError, adapterFor, sleeperAdapter } from '../adapters.js';
import { env } from '../env.js';
import { isMockRequested } from '../lib/mock.js';
import { parsePlatform } from '../lib/platform.js';

async function getSleeperLeagues(useMock: boolean): Promise<League[]> {
  if (useMock) {
    return adapterFor('sleeper', true).getLeagues(MOCK_SLEEPER_OWNER_ID, env.espnSeason);
  }
  if (!env.sleeperUsername) {
    throw new AdapterNotConfiguredError('sleeper');
  }
  const userId = await sleeperAdapter.resolveUserId(env.sleeperUsername);
  const state = await sleeperAdapter.getNflState();
  const stateSeason = Number(state.league_season ?? state.season);

  const result = await sleeperAdapter.getLeagues(userId, stateSeason);
  if (result.length > 0) {
    return result;
  }
  return sleeperAdapter.getLeagues(userId, stateSeason - 1);
}

async function getEspnLeagues(useMock: boolean): Promise<League[]> {
  const adapter = adapterFor('espn', useMock);
  if (useMock) {
    return adapter.getLeagues(MOCK_ESPN_OWNER_ID, env.espnSeason);
  }
  return adapter.getLeagues(env.espnSwid ?? '', env.espnSeason);
}

export const leagues = new Hono();

leagues.get('/leagues', async (c) => {
  const useMock = isMockRequested(c);
  const [sleeperResult, espnResult] = await Promise.allSettled([
    getSleeperLeagues(useMock),
    getEspnLeagues(useMock),
  ]);

  const combined: League[] = [];
  const errors: { platform: 'sleeper' | 'espn'; error: string }[] = [];

  for (const [platform, result] of [
    ['sleeper', sleeperResult],
    ['espn', espnResult],
  ] as const) {
    if (result.status === 'fulfilled') {
      combined.push(...result.value);
    } else {
      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push({ platform, error: message });
    }
  }

  return c.json({ leagues: combined, errors });
});

leagues.get('/leagues/:platform/:leagueId/teams', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const leagueId = c.req.param('leagueId');
  const adapter = adapterFor(platform, isMockRequested(c));
  const teams = await adapter.getTeams(leagueId);
  return c.json(teams);
});
