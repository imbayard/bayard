import { describe, expect, it } from 'vitest';
import type { NflWeekOpponent, Player } from '../../types/league.js';
import type { OffenseGiveawayRating } from '../../types/nflverse.js';
import { scoutFrame } from './scout-frame.js';

function player(overrides: Partial<Player> & Pick<Player, 'externalPlayerId'>): Player {
  return {
    fullName: 'A Defense',
    position: 'DEF',
    nflTeam: 'MIN',
    injuryStatus: null,
    byeWeek: null,
    projectedPoints: null,
    ...overrides,
  };
}

function rating(team: string, score: number, rank: number): OffenseGiveawayRating {
  return { team, score, rank, pressure: score, turnovers: score, scoring: score, games: 4 };
}

function opponents(entries: [string, string][]): Map<string, NflWeekOpponent> {
  return new Map(
    entries.map(([team, opponent]) => [
      team,
      { team, opponent, home: true, kickoff: '2026-09-13T17:00:00.000Z' },
    ]),
  );
}

const ratings = [rating('CAR', 90, 1), rating('LAR', 10, 3), rating('DAL', 50, 2)];

describe('scoutFrame', () => {
  it('sums week scores and sorts the softest frame first', () => {
    const board = scoutFrame({
      candidates: [
        player({ externalPlayerId: 'min', fullName: 'Vikings D/ST', nflTeam: 'MIN' }),
        player({ externalPlayerId: 'nyj', fullName: 'Jets D/ST', nflTeam: 'NYJ' }),
      ],
      weeks: [3, 4],
      opponentsByWeek: new Map([
        [3, opponents([['MIN', 'CAR'], ['NYJ', 'LAR']])],
        [4, opponents([['MIN', 'DAL'], ['NYJ', 'DAL']])],
      ]),
      ratings,
    });

    expect(board.map((c) => c.playerId)).toEqual(['min', 'nyj']);
    expect(board[0]).toMatchObject({ frameScore: 140, avgOpponentRank: 1.5, byeCount: 0 });
    expect(board[1]).toMatchObject({ frameScore: 60, avgOpponentRank: 2.5 });
    expect(board[0]?.weeks[0]).toEqual({
      week: 3,
      opponent: 'CAR',
      home: true,
      bye: false,
      rank: 1,
      score: 90,
      projectedPoints: null,
    });
  });

  it('counts a bye as zero and reports it', () => {
    const [row] = scoutFrame({
      candidates: [player({ externalPlayerId: 'min' })],
      weeks: [3, 4],
      // MIN is absent from week 4's slate.
      opponentsByWeek: new Map([[3, opponents([['MIN', 'CAR']])], [4, opponents([])]]),
      ratings,
    });

    expect(row).toMatchObject({ frameScore: 90, byeCount: 1, avgOpponentRank: 1 });
    expect(row?.weeks[1]).toMatchObject({ bye: true, opponent: null, rank: null, score: null });
  });

  it('attaches projections only for the weeks that have them', () => {
    const [row] = scoutFrame({
      candidates: [player({ externalPlayerId: 'min' })],
      weeks: [3, 4],
      opponentsByWeek: new Map([
        [3, opponents([['MIN', 'CAR']])],
        [4, opponents([['MIN', 'DAL']])],
      ]),
      ratings,
      projectionsByWeek: new Map([[3, new Map([['min', 8.4]])]]),
    });

    expect(row?.weeks.map((w) => w.projectedPoints)).toEqual([8.4, null]);
  });

  it('drops a candidate with no NFL team', () => {
    const board = scoutFrame({
      candidates: [player({ externalPlayerId: 'ghost', nflTeam: null })],
      weeks: [3],
      opponentsByWeek: new Map([[3, opponents([['MIN', 'CAR']])]]),
      ratings,
    });
    expect(board).toEqual([]);
  });

  it('normalizes the candidate team code before joining the slate', () => {
    // The player map says LA; the schedule and ratings both speak LAR.
    const [row] = scoutFrame({
      candidates: [player({ externalPlayerId: 'la', nflTeam: 'LA' })],
      weeks: [3],
      opponentsByWeek: new Map([[3, opponents([['LAR', 'CAR']])]]),
      ratings,
    });
    expect(row).toMatchObject({ nflTeam: 'LAR', frameScore: 90 });
  });

  it('keeps a game whose opponent has no rating, scoreless', () => {
    const [row] = scoutFrame({
      candidates: [player({ externalPlayerId: 'min' })],
      weeks: [3],
      opponentsByWeek: new Map([[3, opponents([['MIN', 'XXX']])]]),
      ratings,
    });
    expect(row).toMatchObject({ frameScore: 0, byeCount: 0, avgOpponentRank: null });
    expect(row?.weeks[0]).toMatchObject({ bye: false, opponent: 'XXX', score: null });
  });
});
