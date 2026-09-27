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
  /**
   * AccuWeather-sourced kickoff conditions, posted a few days out and absent for neutral sites.
   * ESPN is inconsistent about which of `displayValue`/`conditionId` holds the sentence and
   * which holds a numeric condition code, so read whichever isn't a number.
   */
  weather?: { displayValue?: string; conditionId?: string; temperature?: number };
  /** Always exactly one competition for NFL. */
  competitions: EspnScoreboardCompetition[];
}

export interface EspnScoreboardCompetition {
  /** Home and away, in no guaranteed order — read `homeAway`, not position. */
  competitors: EspnScoreboardCompetitor[];
  venue?: { id?: string; fullName?: string; indoor?: boolean };
  neutralSite?: boolean;
}

export interface EspnScoreboardCompetitor {
  team: { abbreviation: string };
  /** ESPN populates this on the scoreboard; absent on some older/partial payloads. */
  homeAway?: 'home' | 'away';
}
