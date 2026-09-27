import type { League, NflGameState, Platform, RootingSide, RootingStarter } from '@benchpoints/core';
import { buildRootingBoard } from '@benchpoints/core';
import { Hono } from 'hono';
import { adapterFor, nflScheduleFor } from '../adapters.js';
import { resolveOwnerId } from '../lib/league-lookup.js';
import { isMockRequested } from '../lib/mock.js';
import { getEspnLeagues, getSleeperLeagues } from './leagues.js';

/**
 * My starters and my opponent's, for one league's current week. Every call here is one the
 * matchup and bench-iq routes already make, so on a warm cache this costs no platform requests.
 */
async function leagueStarters(
  platform: Platform,
  league: League,
  ownerExternalUserId: string,
  useMock: boolean,
): Promise<RootingStarter[]> {
  const adapter = adapterFor(platform, useMock);
  const leagueId = league.externalLeagueId;
  const week = league.currentWeek;
  const [teams, rosters, matchups, players, projections, points] = await Promise.all([
    adapter.getTeams(leagueId),
    adapter.getRosters(leagueId),
    adapter.getMatchups(leagueId, week),
    adapter.getPlayers(),
    adapter.getProjections(league.season, week, leagueId),
    adapter.getWeekPoints(league.season, week, leagueId),
  ]);

  const myTeam = teams.find(
    (t) => t.ownerExternalUserId.toLowerCase() === ownerExternalUserId.toLowerCase(),
  );
  if (!myTeam) return [];
  const opponentId = matchups.find((m) => m.externalTeamId === myTeam.externalTeamId)?.opponentExternalTeamId;

  const lineups: [string | null | undefined, RootingSide][] = [
    [myTeam.externalTeamId, 'for'],
    [opponentId, 'against'],
  ];
  const starters: RootingStarter[] = [];
  for (const [teamId, side] of lineups) {
    const roster = rosters.find((r) => r.externalTeamId === teamId);
    for (const entry of roster?.entries ?? []) {
      if (entry.slot !== 'starter') continue;
      const player = players.get(entry.externalPlayerId);
      if (!player) continue;
      starters.push({
        leagueName: league.name,
        platform,
        side,
        player,
        projectedPoints: projections.get(entry.externalPlayerId) ?? null,
        actualPoints: points.get(entry.externalPlayerId) ?? null,
      });
    }
  }
  return starters;
}

export const rooting = new Hono();

rooting.get('/rooting', async (c) => {
  const useMock = isMockRequested(c);
  const platformLeagues = await Promise.allSettled([getSleeperLeagues(useMock), getEspnLeagues(useMock)]);

  const errors: { platform: Platform; error: string }[] = [];
  const jobs: Promise<RootingStarter[]>[] = [];
  const weeks: { season: number; week: number }[] = [];

  for (const [i, platform] of (['sleeper', 'espn'] as const).entries()) {
    const result = platformLeagues[i]!;
    if (result.status === 'rejected') {
      errors.push({ platform, error: errorMessage(result.reason) });
      continue;
    }
    const ownerId = resolveOwnerId(platform, useMock);
    for (const league of result.value) {
      weeks.push({ season: league.season, week: league.currentWeek });
      jobs.push(ownerId.then((id) => leagueStarters(platform, league, id, useMock)));
    }
  }

  // One league failing shouldn't blank the board; it just stops contributing.
  const settled = await Promise.allSettled(jobs);
  const starters = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  for (const r of settled) {
    if (r.status === 'rejected') console.error('rooting: league skipped', r.reason);
  }

  // Every league is on the same NFL week in practice; the latest one is the slate that matters.
  const current = weeks.reduce<{ season: number; week: number } | null>(
    (max, w) => (max === null || w.week > max.week ? w : max),
    null,
  );
  // Game state is context: without the slate, rows just carry no indicator.
  const gameStates = current
    ? await nflScheduleFor(useMock)
        .getWeekGameStates(current.season, current.week)
        .catch(() => new Map<string, NflGameState>())
    : new Map<string, NflGameState>();

  return c.json({
    week: current?.week ?? null,
    rows: buildRootingBoard(starters, gameStates),
    errors,
  });
});

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
