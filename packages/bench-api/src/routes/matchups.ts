import type { Matchup, NflGameState, Player, Roster, RosterEntry } from '@benchpoints/core';
import { normalizeTeamCode } from '@benchpoints/core';
import { Hono } from 'hono';
import { adapterFor, nflScheduleFor } from '../adapters.js';
import { env } from '../env.js';
import { isMockRequested } from '../lib/mock.js';
import { parsePlatform } from '../lib/platform.js';
import { sumStarterProjections } from '../lib/projections.js';

export const matchups = new Hono();

matchups.get('/leagues/:platform/:leagueId/matchups/:week', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const leagueId = c.req.param('leagueId');
  const week = Number(c.req.param('week'));
  const season = Number(c.req.query('season') ?? env.espnSeason);
  const useMock = isMockRequested(c);
  const adapter = adapterFor(platform, useMock);

  // Platform matchup endpoints carry only points, so projections and kickoff state get
  // joined on here. Every call below is cached in its adapter — the player map hardest.
  const [raw, leagueRosters, players, projections, gameStates] = await Promise.all([
    adapter.getMatchups(leagueId, week),
    adapter.getRosters(leagueId),
    adapter.getPlayers(),
    adapter.getProjections(season, week),
    nflScheduleFor(useMock).getWeekGameStates(season, week),
  ]);
  for (const [playerId, projectedPoints] of projections) {
    const player = players.get(playerId);
    if (player) player.projectedPoints = projectedPoints;
  }

  const rosterByTeamId = new Map(leagueRosters.map((r) => [r.externalTeamId, r]));
  const enriched = raw.map((matchup) => {
    const roster = rosterByTeamId.get(matchup.externalTeamId);
    return roster ? enrich(matchup, roster, players, gameStates) : matchup;
  });

  return c.json(enriched);
});

function enrich(
  matchup: Matchup,
  roster: Roster,
  players: Map<string, Player>,
  gameStates: Map<string, NflGameState>,
): Matchup {
  const gameFor = (entry: RosterEntry): NflGameState | undefined => {
    // No entry when the player has no NFL team, is on bye, or his game isn't on this slate.
    const nflTeam = players.get(entry.externalPlayerId)?.nflTeam;
    return nflTeam ? gameStates.get(normalizeTeamCode(nflTeam)) : undefined;
  };

  const starterGames = roster.entries.filter((e) => e.slot === 'starter').map(gameFor).filter(isGame);
  // ir/taxi players can't score for this team, so their kickoffs say nothing about when
  // the matchup gets going.
  const playerGames = roster.entries
    .filter((e) => e.slot === 'starter' || e.slot === 'bench')
    .map(gameFor)
    .filter(isGame);

  return {
    ...matchup,
    projectedPoints: sumStarterProjections(roster, players),
    anyStarterStarted: starterGames.some((g) => g.state !== 'pre'),
    firstStarterKickoff: earliestKickoff(starterGames),
    firstPlayerKickoff: earliestKickoff(playerGames),
  };
}

function isGame(game: NflGameState | undefined): game is NflGameState {
  return game !== undefined;
}

/** Kickoffs are normalized ISO strings, so the lexical minimum is the chronological one. */
function earliestKickoff(games: NflGameState[]): string | null {
  return games.reduce<string | null>((min, g) => (min === null || g.kickoff < min ? g.kickoff : min), null);
}
