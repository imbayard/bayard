import type { DraftBoard, League, Matchup, Platform, Player, Roster, Team } from './league.js';

export interface PlatformAdapter {
  platform: Platform;
  resolveUserId(usernameOrId: string): Promise<string>;
  getLeagues(externalUserId: string, season: number): Promise<League[]>;
  getTeams(externalLeagueId: string): Promise<Team[]>;
  getRosters(externalLeagueId: string): Promise<Roster[]>;
  getMatchups(externalLeagueId: string, week: number): Promise<Matchup[]>;
  /** Master player map keyed by externalPlayerId. Large — cache aggressively. */
  getPlayers(): Promise<Map<string, Player>>;
  /** The league's most recent draft and its picks; null when the league has no draft. Omitted by platforms with no draft support. */
  getDraft?(externalLeagueId: string): Promise<DraftBoard | null>;
  /** Projected fantasy points for the given week, keyed by externalPlayerId. Empty map if the platform has no projections source. */
  getProjections(season: number, week: number): Promise<Map<string, number>>;
  /** Mean fantasy points per game played this season, keyed by externalPlayerId. Empty map if the platform has no source. */
  getSeasonAverages(season: number, throughWeek: number): Promise<Map<string, number>>;
}
