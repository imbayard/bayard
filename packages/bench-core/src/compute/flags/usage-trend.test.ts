import { describe, expect, it } from 'vitest';
import { mockAnalyticsClient } from '../../mocks/index.js';
import type { MetricWindows, PlayerCard } from '../../types/analytics.js';
import type { Player, Roster } from '../../types/league.js';
import { usageTrendFlags } from './usage-trend.js';

function player(id: string, position = 'WR'): Player {
  return { externalPlayerId: id, fullName: id, position, nflTeam: null, injuryStatus: null, byeWeek: null, projectedPoints: null };
}

function card(metrics: Record<string, MetricWindows>): PlayerCard {
  return { name: 'x', position: 'WR', posGroup: 'WR', metrics };
}

const w = (value: number, n: number) => ({ value, shrunk: null, n, pct: null });

const roster: Roster = {
  externalTeamId: '1',
  entries: [
    { externalPlayerId: 'starter', slot: 'starter' },
    { externalPlayerId: 'bench', slot: 'bench' },
    { externalPlayerId: 'ir', slot: 'ir' },
  ],
};
const players = new Map(['starter', 'bench', 'ir'].map((id) => [id, player(id)]));

describe('usageTrendFlags', () => {
  it('flags a starter losing targets against this season', () => {
    const cards = new Map([['starter', card({ target_share: { last4: w(0.15, 4), season: w(0.26, 8) } })]]);
    const [flag] = usageTrendFlags(roster, players, cards);
    expect(flag).toMatchObject({ type: 'USAGE_TREND', level: 'warning', playerId: 'starter', slot: 'starter' });
    expect(flag!.message).toBe('starter: target share 15% over the last 4 games, down from 26% this season');
  });

  it('compares against last season while the season is still short', () => {
    const cards = new Map([
      ['bench', card({ carry_share: { last4: w(0.47, 3), season: w(0.47, 3), prior: w(0.17, 16) } })],
    ]);
    const [flag] = usageTrendFlags(roster, players, cards);
    expect(flag!.message).toBe('bench (bench): carry share 47% over the last 3 games, up from 17% last season');
  });

  it('ignores the direction that does not change a lineup', () => {
    const cards = new Map([
      ['starter', card({ target_share: { last4: w(0.3, 4), season: w(0.2, 8) } })], // starter rising
      ['bench', card({ target_share: { last4: w(0.05, 4), season: w(0.2, 8) } })], // bench falling
    ]);
    expect(usageTrendFlags(roster, players, cards)).toEqual([]);
  });

  it('stays quiet under the threshold, on thin samples, and for IR', () => {
    const cards = new Map([
      ['starter', card({ target_share: { last4: w(0.2, 4), season: w(0.25, 8) } })], // 5 pts < 7
      ['bench', card({ carry_share: { last4: w(0.6, 1), season: w(0.2, 8) } })], // one game
      ['ir', card({ target_share: { last4: w(0.0, 4), season: w(0.3, 8) } })],
    ]);
    expect(usageTrendFlags(roster, players, cards)).toEqual([]);
  });

  it('reports only the strongest move per player', () => {
    const cards = new Map([
      [
        'starter',
        card({
          target_share: { last4: w(0.12, 4), season: w(0.2, 8) }, // 8 pts / 7 ≈ 1.1 thresholds
          off_snap_pct: { last4: w(0.5, 4), season: w(0.9, 8) }, // 40 pts / 15 ≈ 2.7
        }),
      ],
    ]);
    const flags = usageTrendFlags(roster, players, cards);
    expect(flags).toHaveLength(1);
    expect(flags[0]!.message).toContain('snap share 50%');
  });

  it('flags the mock roster through the mock client', async () => {
    const mockRoster: Roster = {
      externalTeamId: '1',
      entries: [
        { externalPlayerId: 'p-ddf-wr2', slot: 'starter' },
        { externalPlayerId: 'p-ddf-rb2', slot: 'starter' },
        { externalPlayerId: 'p-ddf-bn1', slot: 'bench' },
      ],
    };
    const mockPlayers = new Map(['p-ddf-wr2', 'p-ddf-rb2', 'p-ddf-bn1'].map((id) => [id, player(id)]));
    const { players: cards } = await mockAnalyticsClient.getPlayerCards('sleeper', ['p-ddf-wr2', 'p-ddf-rb2', 'p-ddf-bn1', 'nope'], 2026);
    expect([...cards.keys()].sort()).toEqual(['p-ddf-bn1', 'p-ddf-rb2', 'p-ddf-wr2']);
    expect(usageTrendFlags(mockRoster, mockPlayers, cards).map((f) => f.playerId)).toEqual(['p-ddf-wr2', 'p-ddf-bn1']);
  });
});
