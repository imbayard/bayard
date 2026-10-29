import type { MarketValue, TradeMode } from '@benchpoints/core';
import { marketFormat, tradeRadar } from '@benchpoints/core';
import { Hono } from 'hono';
import { adapterFor, analyticsFor, fantasyCalcFor } from '../adapters.js';
import { findLeague } from '../lib/league-lookup.js';
import { isMockRequested } from '../lib/mock.js';
import { parsePlatform } from '../lib/platform.js';

export const trades = new Hono();

/**
 * Trade Radar: packages between my team and the rest of the league. `mode` is buyer|seller
 * (omitted → the suggested one); `market=off` judges fairness on our values instead of
 * FantasyCalc's. Computed on every call — nothing is stored.
 */
trades.get('/leagues/:platform/:leagueId/trades', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const leagueId = c.req.param('leagueId');
  const useMock = isMockRequested(c);
  const adapter = adapterFor(platform, useMock);

  const modeParam = c.req.query('mode');
  if (modeParam !== undefined && modeParam !== 'buyer' && modeParam !== 'seller') {
    return c.json({ error: `Unknown mode "${modeParam}". Expected "buyer" or "seller".` }, 400);
  }
  const mode = modeParam as TradeMode | undefined;
  const useMarket = c.req.query('market') !== 'off';

  const lookup = await findLeague(platform, leagueId, useMock);
  if (!lookup) return c.json({ error: `League "${leagueId}" not found` }, 404);
  const { league, ownerExternalUserId } = lookup;
  if (league.leagueType === 'bestball') {
    return c.json({ error: 'Best-ball leagues have no trades to find.' }, 400);
  }

  const throughWeek = Math.max(0, league.currentWeek - 1);
  const [teams, rosters, players, production, calibration, market] = await Promise.all([
    adapter.getTeams(leagueId),
    adapter.getRosters(leagueId),
    adapter.getPlayers(),
    adapter.getSeasonProduction(league, throughWeek),
    // Both are refinements: the compute falls back to a built-in calibration and to our values.
    analyticsFor(useMock).getCalibration('ppr_pg').catch(() => null),
    fantasyCalcFor(useMock)
      .getValues(marketFormat(league), platform)
      .catch((): Map<string, MarketValue> | null => null),
  ]);

  const myTeam = teams.find((t) => t.ownerExternalUserId.toLowerCase() === ownerExternalUserId.toLowerCase());
  if (!myTeam) return c.json({ error: `Could not find your team in league "${leagueId}"` }, 404);

  const result = tradeRadar({
    league,
    teams,
    rosters,
    players,
    myTeamId: myTeam.externalTeamId,
    production,
    calibration,
    market,
    useMarket,
    mode,
  });
  return c.json(result);
});
