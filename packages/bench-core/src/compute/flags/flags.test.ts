import { describe, expect, it } from 'vitest';
import type { Player, Roster } from '../../types/league.js';
import { benchHigherProjectionFlags } from './bench-higher-projection.js';
import { byeWeekStarterFlags } from './bye-week-starter.js';
import { incompleteLineupFlags } from './incomplete-lineup.js';
import { startingInactiveFlags } from './starting-inactive.js';
import { waiverHigherProjectionFlags } from './waiver-higher-projection.js';
import { computeBenchIqFlags, MIN_BENCH_UPGRADE_DELTA, MIN_WAIVER_UPGRADE_DELTA } from './index.js';

const ROSTER_SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'BN', 'BN'];

function player(overrides: Partial<Player> & { externalPlayerId: string }): Player {
  return {
    fullName: overrides.externalPlayerId,
    position: 'RB',
    nflTeam: null,
    injuryStatus: null,
    byeWeek: null,
    projectedPoints: null,
    ...overrides,
  };
}

function playersMap(list: Player[]): Map<string, Player> {
  return new Map(list.map((p) => [p.externalPlayerId, p]));
}

const cleanRoster: Roster = {
  externalTeamId: '1',
  entries: [
    { externalPlayerId: 'qb1', slot: 'starter' },
    { externalPlayerId: 'rb1', slot: 'starter' },
    { externalPlayerId: 'wr1', slot: 'starter' },
    { externalPlayerId: 'te1', slot: 'starter' },
    { externalPlayerId: 'flex1', slot: 'starter' },
    { externalPlayerId: 'bench1', slot: 'bench' },
  ],
};

const cleanPlayers = playersMap([
  player({ externalPlayerId: 'qb1', fullName: 'Clean QB', byeWeek: 5 }),
  player({ externalPlayerId: 'rb1', fullName: 'Clean RB', byeWeek: 6 }),
  player({ externalPlayerId: 'wr1', fullName: 'Clean WR', byeWeek: 7 }),
  player({ externalPlayerId: 'te1', fullName: 'Clean TE', byeWeek: 8 }),
  player({ externalPlayerId: 'flex1', fullName: 'Clean Flex', byeWeek: 9 }),
  player({ externalPlayerId: 'bench1', fullName: 'Clean Bench', injuryStatus: 'Out' }),
]);

describe('byeWeekStarterFlags', () => {
  it('flags a starter on bye this week', () => {
    const players = playersMap([player({ externalPlayerId: 'qb1', fullName: 'Josh Allen', byeWeek: 5 })]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [{ externalPlayerId: 'qb1', slot: 'starter' }],
    };

    const flags = byeWeekStarterFlags(roster, players, 5);

    expect(flags).toEqual([
      {
        type: 'BYE_WEEK_STARTER',
        level: 'critical',
        playerId: 'qb1',
        playerName: 'Josh Allen',
        slot: 'starter',
        message: 'Josh Allen is on bye this week',
        delta: null,
        starterName: null,
      },
    ]);
  });

  it('does not flag a bench player on bye', () => {
    const players = playersMap([player({ externalPlayerId: 'bn1', byeWeek: 5 })]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [{ externalPlayerId: 'bn1', slot: 'bench' }],
    };

    expect(byeWeekStarterFlags(roster, players, 5)).toEqual([]);
  });
});

describe('startingInactiveFlags', () => {
  it.each(['Out', 'IR', 'Suspended'])('flags a starter marked %s', (status) => {
    const players = playersMap([
      player({ externalPlayerId: 'wr1', fullName: 'Hurt Guy', injuryStatus: status }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [{ externalPlayerId: 'wr1', slot: 'starter' }],
    };

    const flags = startingInactiveFlags(roster, players);

    expect(flags).toEqual([
      {
        type: 'STARTING_INACTIVE',
        level: 'critical',
        playerId: 'wr1',
        playerName: 'Hurt Guy',
        slot: 'starter',
        message: `Hurt Guy is starting while marked ${status}`,
        delta: null,
        starterName: null,
      },
    ]);
  });

  it('does not flag questionable or doubtful starters', () => {
    const players = playersMap([
      player({ externalPlayerId: 'wr1', injuryStatus: 'Questionable' }),
      player({ externalPlayerId: 'wr2', injuryStatus: 'Doubtful' }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'wr1', slot: 'starter' },
        { externalPlayerId: 'wr2', slot: 'starter' },
      ],
    };

    expect(startingInactiveFlags(roster, players)).toEqual([]);
  });
});

describe('incompleteLineupFlags', () => {
  it('flags each unfilled starter slot generically when entries carry no positionSlot', () => {
    const roster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'qb1', slot: 'starter' },
        { externalPlayerId: 'rb1', slot: 'starter' },
      ],
    };

    const flags = incompleteLineupFlags(roster, ROSTER_SLOTS);

    // ROSTER_SLOTS starters: QB, RB, WR, TE, FLEX (5) - 2 filled (unlabeled) = 3 remaining
    expect(flags).toHaveLength(3);
    for (const flag of flags) {
      expect(flag.type).toBe('INCOMPLETE_LINEUP');
      expect(flag.playerId).toBeNull();
      expect(flag.message).toMatch(/slot is unfilled$/);
    }
  });

  it('names the specific unfilled slot when entries carry a positionSlot', () => {
    const roster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'qb1', slot: 'starter', positionSlot: 'QB' },
        { externalPlayerId: 'rb1', slot: 'starter', positionSlot: 'RB' },
      ],
    };

    const flags = incompleteLineupFlags(roster, ROSTER_SLOTS);

    expect(flags).toEqual([
      {
        type: 'INCOMPLETE_LINEUP',
        level: 'critical',
        playerId: null,
        playerName: null,
        slot: 'WR',
        message: 'WR slot is unfilled',
        delta: null,
        starterName: null,
      },
      {
        type: 'INCOMPLETE_LINEUP',
        level: 'critical',
        playerId: null,
        playerName: null,
        slot: 'TE',
        message: 'TE slot is unfilled',
        delta: null,
        starterName: null,
      },
      {
        type: 'INCOMPLETE_LINEUP',
        level: 'critical',
        playerId: null,
        playerName: null,
        slot: 'FLEX',
        message: 'FLEX slot is unfilled',
        delta: null,
        starterName: null,
      },
    ]);
  });

  it('does not flag a full lineup', () => {
    expect(incompleteLineupFlags(cleanRoster, ROSTER_SLOTS)).toEqual([]);
  });
});

describe('benchHigherProjectionFlags', () => {
  it('flags the bench player when it outprojects the same-position starter', () => {
    const players = playersMap([
      player({ externalPlayerId: 'rb1', fullName: 'Starter RB', position: 'RB', projectedPoints: 9.5 }),
      player({ externalPlayerId: 'bn1', fullName: 'Bench RB', position: 'RB', projectedPoints: 14.2 }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'rb1', slot: 'starter', positionSlot: 'RB' },
        { externalPlayerId: 'bn1', slot: 'bench' },
      ],
    };

    expect(benchHigherProjectionFlags(roster, players)).toEqual([
      {
        type: 'BENCH_PLAYER_HIGHER_PROJECTION',
        level: 'warning',
        playerId: 'bn1',
        playerName: 'Bench RB',
        slot: 'RB',
        message: 'Bench RB projects +4.7 over your RB starter, Starter RB',
        delta: 4.7,
        starterName: 'Starter RB',
      },
    ]);
  });

  it('flags a FLEX-eligible bench player via ELIGIBLE_POSITIONS', () => {
    const players = playersMap([
      player({ externalPlayerId: 'flex1', fullName: 'Flex WR', position: 'WR', projectedPoints: 8 }),
      player({ externalPlayerId: 'bn1', fullName: 'Bench TE', position: 'TE', projectedPoints: 12 }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'flex1', slot: 'starter', positionSlot: 'FLEX' },
        { externalPlayerId: 'bn1', slot: 'bench' },
      ],
    };

    const flags = benchHigherProjectionFlags(roster, players);
    expect(flags).toHaveLength(1);
    expect(flags[0]?.playerId).toBe('bn1');
  });

  it('does not flag when the higher-projected bench player is not eligible for the slot', () => {
    const players = playersMap([
      player({ externalPlayerId: 'qb1', fullName: 'Starter QB', position: 'QB', projectedPoints: 9 }),
      player({ externalPlayerId: 'bn1', fullName: 'Bench RB', position: 'RB', projectedPoints: 20 }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'qb1', slot: 'starter', positionSlot: 'QB' },
        { externalPlayerId: 'bn1', slot: 'bench' },
      ],
    };

    expect(benchHigherProjectionFlags(roster, players)).toEqual([]);
  });

  it('does not flag when projections are unknown', () => {
    const players = playersMap([
      player({ externalPlayerId: 'rb1', fullName: 'Starter RB', position: 'RB', projectedPoints: null }),
      player({ externalPlayerId: 'bn1', fullName: 'Bench RB', position: 'RB', projectedPoints: null }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'rb1', slot: 'starter', positionSlot: 'RB' },
        { externalPlayerId: 'bn1', slot: 'bench' },
      ],
    };

    expect(benchHigherProjectionFlags(roster, players)).toEqual([]);
  });

  it('keeps only the biggest edge when one bench player tops several slots', () => {
    const players = playersMap([
      player({ externalPlayerId: 'wr1', fullName: 'Starter WR', position: 'WR', projectedPoints: 8 }),
      player({ externalPlayerId: 'flex1', fullName: 'Starter Flex', position: 'RB', projectedPoints: 5 }),
      player({ externalPlayerId: 'bn1', fullName: 'Jayden Reed', position: 'WR', projectedPoints: 14 }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'wr1', slot: 'starter', positionSlot: 'WR' },
        { externalPlayerId: 'flex1', slot: 'starter', positionSlot: 'FLEX' },
        { externalPlayerId: 'bn1', slot: 'bench' },
      ],
    };

    const flags = benchHigherProjectionFlags(roster, players);

    expect(flags).toHaveLength(1);
    expect(flags[0]?.slot).toBe('FLEX');
    expect(flags[0]?.delta).toBe(9);
    expect(flags[0]?.starterName).toBe('Starter Flex');
  });

  it(`does not flag a bench player winning by less than ${MIN_BENCH_UPGRADE_DELTA}`, () => {
    const players = playersMap([
      player({ externalPlayerId: 'k1', fullName: 'Starter K', position: 'K', projectedPoints: 8.2 }),
      player({ externalPlayerId: 'bn1', fullName: 'Bench K', position: 'K', projectedPoints: 9.1 }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'k1', slot: 'starter', positionSlot: 'K' },
        { externalPlayerId: 'bn1', slot: 'bench' },
      ],
    };

    expect(benchHigherProjectionFlags(roster, players)).toEqual([]);
  });
});

describe('waiverHigherProjectionFlags', () => {
  it('flags an unrostered player when it outprojects the same-position starter', () => {
    const players = playersMap([
      player({ externalPlayerId: 'wr1', fullName: 'Starter WR', position: 'WR', projectedPoints: 8 }),
      player({ externalPlayerId: 'waiver1', fullName: 'Waiver WR', position: 'WR', projectedPoints: 16.8 }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [{ externalPlayerId: 'wr1', slot: 'starter', positionSlot: 'WR' }],
    };
    const rosteredPlayerIds = new Set(['wr1']);

    expect(waiverHigherProjectionFlags(roster, players, rosteredPlayerIds)).toEqual([
      {
        type: 'WAIVER_PLAYER_HIGHER_PROJECTION',
        level: 'warning',
        playerId: 'waiver1',
        playerName: 'Waiver WR',
        slot: 'WR',
        message: 'Waiver WR is on waivers and projects +8.8 over your WR starter, Starter WR',
        delta: 8.8,
        starterName: 'Starter WR',
      },
    ]);
  });

  it('does not flag a player rostered by another team', () => {
    const players = playersMap([
      player({ externalPlayerId: 'wr1', fullName: 'Starter WR', position: 'WR', projectedPoints: 8 }),
      player({ externalPlayerId: 'other-wr', fullName: 'Other Team WR', position: 'WR', projectedPoints: 16.8 }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [{ externalPlayerId: 'wr1', slot: 'starter', positionSlot: 'WR' }],
    };
    const rosteredPlayerIds = new Set(['wr1', 'other-wr']);

    expect(waiverHigherProjectionFlags(roster, players, rosteredPlayerIds)).toEqual([]);
  });

  it('keeps only the biggest edge when one waiver player tops several slots', () => {
    const players = playersMap([
      player({ externalPlayerId: 'qb1', fullName: 'Starter QB', position: 'QB', projectedPoints: 14 }),
      player({ externalPlayerId: 'sf1', fullName: 'Starter SuperFlex', position: 'QB', projectedPoints: 11 }),
      player({ externalPlayerId: 'waiver1', fullName: 'Kirk Cousins', position: 'QB', projectedPoints: 19 }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'qb1', slot: 'starter', positionSlot: 'QB' },
        { externalPlayerId: 'sf1', slot: 'starter', positionSlot: 'SUPER_FLEX' },
      ],
    };
    const rosteredPlayerIds = new Set(['qb1', 'sf1']);

    const flags = waiverHigherProjectionFlags(roster, players, rosteredPlayerIds);

    expect(flags).toHaveLength(1);
    expect(flags[0]?.slot).toBe('SUPER_FLEX');
    expect(flags[0]?.delta).toBe(8);
  });

  it(`does not flag a waiver player winning by less than ${MIN_WAIVER_UPGRADE_DELTA}`, () => {
    const players = playersMap([
      player({ externalPlayerId: 'def1', fullName: 'Chicago Bears', position: 'DEF', projectedPoints: 6.4 }),
      player({ externalPlayerId: 'waiver1', fullName: 'Las Vegas Raiders', position: 'DEF', projectedPoints: 8.9 }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [{ externalPlayerId: 'def1', slot: 'starter', positionSlot: 'DEF' }],
    };
    const rosteredPlayerIds = new Set(['def1']);

    expect(waiverHigherProjectionFlags(roster, players, rosteredPlayerIds)).toEqual([]);
  });
});

describe('computeBenchIqFlags', () => {
  it('returns no flags for a clean roster', () => {
    expect(computeBenchIqFlags(cleanRoster, cleanPlayers, 1, ROSTER_SLOTS)).toEqual([]);
  });

  it('returns no flags for an empty (undrafted) roster', () => {
    const emptyRoster: Roster = { externalTeamId: '1', entries: [] };
    expect(computeBenchIqFlags(emptyRoster, cleanPlayers, 1, ROSTER_SLOTS)).toEqual([]);
  });

  it('collapses a bench and a waiver upgrade for the same slot, keeping the bigger edge', () => {
    const players = playersMap([
      player({ externalPlayerId: 'def1', fullName: 'Chicago Bears', position: 'DEF', projectedPoints: 5 }),
      player({ externalPlayerId: 'bn-def', fullName: 'Seattle Seahawks', position: 'DEF', projectedPoints: 9 }),
      player({ externalPlayerId: 'waiver-def', fullName: 'Las Vegas Raiders', position: 'DEF', projectedPoints: 12 }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'def1', slot: 'starter', positionSlot: 'DEF' },
        { externalPlayerId: 'bn-def', slot: 'bench' },
      ],
    };
    const rosteredPlayerIds = new Set(['def1', 'bn-def']);

    const flags = computeBenchIqFlags(roster, players, 1, ['DEF', 'BN'], rosteredPlayerIds);

    expect(flags).toHaveLength(1);
    expect(flags[0]?.type).toBe('WAIVER_PLAYER_HIGHER_PROJECTION');
    expect(flags[0]?.playerName).toBe('Las Vegas Raiders');
    expect(flags[0]?.delta).toBe(7);
  });

  it('prefers the bench flag when the bench and waiver edges tie, since it costs no roster move', () => {
    const players = playersMap([
      player({ externalPlayerId: 'def1', fullName: 'Chicago Bears', position: 'DEF', projectedPoints: 5 }),
      player({ externalPlayerId: 'bn-def', fullName: 'Seattle Seahawks', position: 'DEF', projectedPoints: 12 }),
      player({ externalPlayerId: 'waiver-def', fullName: 'Las Vegas Raiders', position: 'DEF', projectedPoints: 12 }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'def1', slot: 'starter', positionSlot: 'DEF' },
        { externalPlayerId: 'bn-def', slot: 'bench' },
      ],
    };
    const rosteredPlayerIds = new Set(['def1', 'bn-def']);

    const flags = computeBenchIqFlags(roster, players, 1, ['DEF', 'BN'], rosteredPlayerIds);

    expect(flags).toHaveLength(1);
    expect(flags[0]?.type).toBe('BENCH_PLAYER_HIGHER_PROJECTION');
    expect(flags[0]?.playerName).toBe('Seattle Seahawks');
  });

  it('leaves critical flags untouched by the per-slot collapse', () => {
    const players = playersMap([
      player({ externalPlayerId: 'rb1', fullName: 'Bye RB', position: 'RB', projectedPoints: 5, byeWeek: 3 }),
      player({ externalPlayerId: 'bn1', fullName: 'Bench RB', position: 'RB', projectedPoints: 12 }),
    ]);
    const roster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'rb1', slot: 'starter', positionSlot: 'RB' },
        { externalPlayerId: 'bn1', slot: 'bench' },
      ],
    };

    const types = computeBenchIqFlags(roster, players, 3, ['RB', 'BN']).map((f) => f.type);

    expect(types).toEqual(['BYE_WEEK_STARTER', 'BENCH_PLAYER_HIGHER_PROJECTION']);
  });
});
