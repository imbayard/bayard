import { Hono } from 'hono';
import { weatherFor } from '../adapters.js';
import { isMockRequested } from '../lib/mock.js';

export const weather = new Hono();

/**
 * The week's weather, keyed by NFL team code — both sides of a game map to the same read,
 * so a roster row joins on `player.nflTeam` directly. Not league-scoped: the slate is the
 * same for every league, and so is its weather.
 */
weather.get('/weather/:season/:week', async (c) => {
  const season = Number(c.req.param('season'));
  const week = Number(c.req.param('week'));
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1) {
    return c.json({ error: 'Season and week must be whole numbers.' }, 400);
  }
  const byTeam = await weatherFor(isMockRequested(c)).getWeekWeather(season, week);
  return c.json(Object.fromEntries(byTeam));
});
