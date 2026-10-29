import type { DraftBoard, League, Matchup, Platform, Player, Roster, Team } from './league.js';

/** One player's production this season and last, scored with the league's rules. */
export interface SeasonProduction {
  ppg: number;
  games: number;
  /** Last season's points per game; null when he didn't play. */
  priorPpg: number | null;
  priorGames: number;
}

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
  /**
   * Projected fantasy points for the given week, keyed by externalPlayerId. Empty map if the
   * platform has no projections source. `externalLeagueId` is for platforms that score
   * projections with the league's own rules (ESPN); platforms with one global projection
   * (Sleeper) ignore it.
   */
  getProjections(season: number, week: number, externalLeagueId?: string): Promise<Map<string, number>>;
  /**
   * Fantasy points actually scored this week so far, keyed by externalPlayerId and scored with
   * the league's rules. Moves during games; empty before kickoff.
   */
  getWeekPoints(season: number, week: number, externalLeagueId: string): Promise<Map<string, number>>;
  /** Mean fantasy points per game played this season, keyed by externalPlayerId. Empty map if the platform has no source. */
  getSeasonAverages(
    season: number,
    throughWeek: number,
    externalLeagueId?: string,
  ): Promise<Map<string, number>>;
  /**
   * Season-to-date and prior-season points per game for every player the platform reports,
   * scored with `league`'s rules as closely as the platform allows. Keyed by externalPlayerId.
   */
  getSeasonProduction(league: League, throughWeek: number): Promise<Map<string, SeasonProduction>>;
}
