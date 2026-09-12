/** Raw ESPN scoreboard response shapes. Only the fields we consume. */

/**
 * GET https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard
 *   ?dates={season}&seasontype=2&week={week}
 * One request returns the whole week's slate (~16 events). No auth.
 */
export interface EspnScoreboardResponse {
  events: EspnScoreboardEvent[];
}

export interface EspnScoreboardEvent {
  /** Kickoff, minute precision and no offset separator, e.g. "2025-09-05T00:20Z" */
  date: string;
  status: { type: { state: string } };
  /** Always exactly one competition for NFL. */
  competitions: EspnScoreboardCompetition[];
}

export interface EspnScoreboardCompetition {
  /** Home and away, in no guaranteed order — read `homeAway`, not position. */
  competitors: EspnScoreboardCompetitor[];
}

export interface EspnScoreboardCompetitor {
  team: { abbreviation: string };
  /** ESPN populates this on the scoreboard; absent on some older/partial payloads. */
  homeAway?: 'home' | 'away';
}
