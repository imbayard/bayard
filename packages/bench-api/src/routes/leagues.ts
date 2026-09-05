import type { League } from '@benchpoints/core';
import { MOCK_ESPN_OWNER_ID, MOCK_SLEEPER_OWNER_ID } from '@benchpoints/core';
import { Hono } from 'hono';
import { AdapterNotConfiguredError, adapterFor, sleeperAdapter } from '../adapters.js';
import { env } from '../env.js';
import { createCalendarEvent } from '../lib/integrations.js';
import { isMockRequested } from '../lib/mock.js';
import { parsePlatform } from '../lib/platform.js';

/** Formats a Date as a naive local "YYYY-MM-DDTHH:MM" string (no timezone suffix). */
function toNaiveLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

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

leagues.get('/leagues/:platform/:leagueId/draft', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const leagueId = c.req.param('leagueId');
  const adapter = adapterFor(platform, isMockRequested(c));

  if (!adapter.getDraft) {
    return c.json({ error: `Draft boards are not supported for platform "${platform}"` }, 400);
  }
  const board = await adapter.getDraft(leagueId);
  if (!board) {
    return c.json({ error: `No draft found for league "${leagueId}"` }, 404);
  }
  return c.json(board);
});

leagues.post('/leagues/:platform/:leagueId/schedule-draft', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const leagueId = c.req.param('leagueId');
  const useMock = isMockRequested(c);

  const allLeagues = platform === 'sleeper' ? await getSleeperLeagues(useMock) : await getEspnLeagues(useMock);
  const league = allLeagues.find((l) => l.externalLeagueId === leagueId);

  if (!league) {
    return c.json({ error: `League "${leagueId}" not found for platform "${platform}"` }, 404);
  }
  if (!league.draftDate) {
    return c.json({ error: 'Draft date not set for this league' }, 404);
  }

  const start = new Date(league.draftDate);
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);

  try {
    const result = await createCalendarEvent({
      app: 'bench',
      title: `${league.name} Draft`,
      start: toNaiveLocal(start),
      end: toNaiveLocal(end),
    });
    return c.json({ id: result.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 502);
  }
});
