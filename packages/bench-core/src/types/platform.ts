import type { League, Matchup, Platform, Player, Roster, Team } from './league.js';

export interface PlatformAdapter {
  platform: Platform;
  resolveUserId(usernameOrId: string): Promise<string>;
  getLeagues(externalUserId: string, season: number): Promise<League[]>;
  getTeams(externalLeagueId: string): Promise<Team[]>;
  getRosters(externalLeagueId: string): Promise<Roster[]>;
  getMatchups(externalLeagueId: string, week: number): Promise<Matchup[]>;
  /** Master player map keyed by externalPlayerId. Large — cache aggressively. */
  getPlayers(): Promise<Map<string, Player>>;
  /** Projected fantasy points for the given week, keyed by externalPlayerId. Empty map if the platform has no projections source. */
  getProjections(season: number, week: number): Promise<Map<string, number>>;
}
