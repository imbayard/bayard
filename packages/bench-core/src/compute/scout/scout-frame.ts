import type { NflWeekOpponent, Player } from '../../types/league.js';
import type { OffenseGiveawayRating } from '../../types/nflverse.js';
import { normalizeTeamCode } from '../../adapters/nflverse/team-codes.js';
import { round1 } from '../normalize.js';

/** One week of a candidate's frame. A bye carries no opponent and scores nothing. */
export interface ScoutWeekCell {
  week: number;
  /** Normalized code of the team faced; null on a bye. */
  opponent: string | null;
  /** True when the candidate is at home; null when the schedule didn't say. */
  home: boolean | null;
  bye: boolean;
  /** 1-32 rank of that opponent's offense as a matchup (1 = softest); null on a bye. */
  rank: number | null;
  /** 0-100 matchup score; null on a bye — `frameScore` counts it as 0. */
  score: number | null;
  /** Platform projection, where one exists for that week. Never derived. */
  projectedPoints: number | null;
}

export interface ScoutCandidate {
  playerId: string;
  name: string;
  nflTeam: string;
  weeks: ScoutWeekCell[];
  /** Sum of the frame's week scores, byes counted as 0. */
  frameScore: number;
  /** Mean opponent rank across the weeks actually played; null when every week is a bye. */
  avgOpponentRank: number | null;
  byeCount: number;
}

export interface ScoutFrameInput {
  /** Candidates already filtered to the asked-for position and pool. */
  candidates: Player[];
  /** The frame, in ascending week order. */
  weeks: number[];
  /** week -> the output of `NflScheduleClient.getWeekOpponents` for that week. */
  opponentsByWeek: Map<number, Map<string, NflWeekOpponent>>;
  /** League-normalized ratings of the offenses being faced. */
  ratings: OffenseGiveawayRating[];
  /** week -> playerId -> projected points. Sparse: platforms only project the current week. */
  projectionsByWeek?: Map<number, Map<string, number>>;
}

/**
 * Builds the scout board: one row per candidate, one cell per week of the frame, sorted
 * by frame score descending. Pure — every lookup it needs is passed in.
 *
 * A candidate with no NFL team can't be joined to a schedule at all, so it is dropped
 * rather than shown as a row of zeroes that would sort below every real option anyway.
 *
 * A bye scores 0 rather than being skipped: a defense that misses a week of the frame
 * really is worth less over that frame than one that plays it, and `byeCount` is carried
 * alongside so a one-week pickup can be judged on its own terms.
 */
export function scoutFrame(input: ScoutFrameInput): ScoutCandidate[] {
  const { candidates, weeks, opponentsByWeek, ratings, projectionsByWeek } = input;
  const ratingByTeam = new Map(ratings.map((r) => [r.team, r]));

  const rows: ScoutCandidate[] = [];
  for (const player of candidates) {
    if (!player.nflTeam) continue;
    const team = normalizeTeamCode(player.nflTeam);

    let frameScore = 0;
    let rankSum = 0;
    let played = 0;
    let byeCount = 0;

    const cells = weeks.map((week): ScoutWeekCell => {
      const projectedPoints = projectionsByWeek?.get(week)?.get(player.externalPlayerId) ?? null;
      const matchup = opponentsByWeek.get(week)?.get(team);
      if (!matchup) {
        byeCount++;
        return { week, opponent: null, home: null, bye: true, rank: null, score: null, projectedPoints };
      }

      // An opponent with no rating (an unrecognized code) is scoreless but still a game played.
      const rating = ratingByTeam.get(matchup.opponent);
      if (rating) {
        frameScore += rating.score;
        rankSum += rating.rank;
        played++;
      }
      return {
        week,
        opponent: matchup.opponent,
        home: matchup.home,
        bye: false,
        rank: rating?.rank ?? null,
        score: rating?.score ?? null,
        projectedPoints,
      };
    });

    rows.push({
      playerId: player.externalPlayerId,
      name: player.fullName,
      nflTeam: team,
      weeks: cells,
      frameScore: round1(frameScore),
      avgOpponentRank: played > 0 ? round1(rankSum / played) : null,
      byeCount,
    });
  }

  // Name breaks ties so the board doesn't reshuffle between identical requests.
  return rows.sort((a, b) => b.frameScore - a.frameScore || a.name.localeCompare(b.name));
}
