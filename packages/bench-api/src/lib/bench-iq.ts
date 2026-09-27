import type { BenchIqFlag, GameWeather, League, Platform, Player, Roster, Team } from '@benchpoints/core';
import { computeBenchIqFlags } from '@benchpoints/core';
import { adapterFor, weatherFor } from '../adapters.js';
import { sumStarterProjections } from './projections.js';
import { rosteredPlayerIds } from './rosters.js';

/** Exactly what `GET /bench-iq` serializes. Kept separate from the richer internal result. */
export interface BenchIqSummary {
  flags: BenchIqFlag[];
  week: number;
  teamId: string;
  rosterCount: number;
  projectedPoints: number | null;
}

/**
 * The summary plus the raw material behind it. The digest needs the roster and player map
 * to build an injury report, and every league's rosters to price the opponent — refetching
 * those would hit the adapter cache, but threading them through is cheaper and clearer.
 */
export interface LeagueBenchIq {
  summary: BenchIqSummary;
  roster: Roster;
  rosters: Roster[];
  players: Map<string, Player>;
  teams: Team[];
  weather: Map<string, GameWeather>;
}

/**
 * Shared by the single-league `/bench-iq` route and the portfolio-wide digest — both need
 * "this owner's flags for this league" and must agree on what a flag is, so this is the one
 * place that computes it. Null when the owner has no team in the league.
 */
export async function computeLeagueBenchIq(
  platform: Platform,
  league: League,
  ownerExternalUserId: string,
  useMock: boolean,
): Promise<LeagueBenchIq | null> {
  const adapter = adapterFor(platform, useMock);
  const [teams, rosters, players, projections, weather] = await Promise.all([
    adapter.getTeams(league.externalLeagueId),
    adapter.getRosters(league.externalLeagueId),
    adapter.getPlayers(),
    adapter.getProjections(league.season, league.currentWeek, league.externalLeagueId),
    // Weather is context, never a dependency: no forecast means no weather flags, not a 502.
    weatherFor(useMock)
      .getWeekWeather(league.season, league.currentWeek)
      .catch(() => new Map<string, GameWeather>()),
  ]);
  for (const [playerId, projectedPoints] of projections) {
    const player = players.get(playerId);
    if (player) player.projectedPoints = projectedPoints;
  }

  const myTeam = teams.find(
    (t) => t.ownerExternalUserId.toLowerCase() === ownerExternalUserId.toLowerCase(),
  );
  const roster = myTeam
    ? rosters.find((r) => r.externalTeamId === myTeam.externalTeamId)
    : undefined;
  if (!roster) return null;

  const flags = computeBenchIqFlags(
    roster,
    players,
    league.currentWeek,
    league.rosterSlots,
    rosteredPlayerIds(rosters),
    weather,
  );

  return {
    summary: {
      flags,
      week: league.currentWeek,
      teamId: roster.externalTeamId,
      rosterCount: roster.entries.length,
      projectedPoints: sumStarterProjections(roster, players),
    },
    roster,
    rosters,
    players,
    teams,
    weather,
  };
}
