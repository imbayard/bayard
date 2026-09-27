import { describe, expect, it } from 'vitest';
import type { Player } from '../types/league.js';
import { buildRootingBoard, rootingKey, type RootingSide, type RootingStarter } from './rooting.js';

function player(fullName: string, position = 'QB', nflTeam: string | null = 'NE'): Player {
  return {
    externalPlayerId: fullName,
    fullName,
    position,
    nflTeam,
    injuryStatus: null,
    byeWeek: null,
    projectedPoints: null,
  };
}

function starter(
  p: Player,
  side: RootingSide,
  projectedPoints: number | null,
  actualPoints: number | null = 0,
  leagueName = 'L',
): RootingStarter {
  return { leagueName, platform: 'sleeper', side, player: p, projectedPoints, actualPoints };
}

describe('rootingKey', () => {
  it('matches the same player across platform naming quirks', () => {
    expect(rootingKey(player('D.J. Moore', 'WR'))).toBe(rootingKey(player('DJ Moore', 'WR')));
    expect(rootingKey(player('Marvin Harrison Jr.', 'WR'))).toBe(rootingKey(player('Marvin Harrison', 'WR')));
  });

  it('keys defenses by normalized team, not name', () => {
    expect(rootingKey(player('Jets D/ST', 'DEF', 'NYJ'))).toBe(rootingKey(player('New York Jets', 'DEF', 'NYJ')));
  });

  it('keeps same-named players at different positions apart', () => {
    expect(rootingKey(player('Josh Allen', 'QB'))).not.toBe(rootingKey(player('Josh Allen', 'LB')));
  });
});

describe('buildRootingBoard', () => {
  it('sums one player across leagues', () => {
    const maye = player('Drake Maye');
    const [row] = buildRootingBoard([
      starter(maye, 'for', 15),
      starter(maye, 'for', 15),
      starter(maye, 'for', 20),
    ]);
    expect(row).toMatchObject({ side: 'for', projectedPoints: 50 });
    expect(row!.stakes).toHaveLength(3);
  });

  it('nets owning against facing', () => {
    const p = player('Bijan Robinson', 'RB');
    const [row] = buildRootingBoard([
      starter(p, 'for', 15, 4),
      starter(p, 'against', 20, 6),
    ]);
    expect(row).toMatchObject({ side: 'against', projectedPoints: 5, actualPoints: 2 });
  });

  it('drops a player who fully cancels out', () => {
    const p = player('Puka Nacua', 'WR');
    expect(buildRootingBoard([starter(p, 'for', 18), starter(p, 'against', 18)])).toEqual([]);
  });

  it('attaches the NFL game, joining on normalized team code', () => {
    const game = { team: 'WAS', kickoff: '2026-09-27T17:00:00Z', state: 'in' as const };
    const [row] = buildRootingBoard(
      [starter(player('Terry McLaurin', 'WR', 'WSH'), 'for', 12)],
      new Map([['WAS', game]]),
    );
    expect(row!.game).toEqual(game);
  });

  it('falls back to lineup count when projections are missing', () => {
    const [row] = buildRootingBoard([starter(player('Rookie Guy', 'WR'), 'against', null)]);
    expect(row).toMatchObject({ side: 'against', projectedPoints: 0 });
  });
});
