import { describe, expect, it } from 'vitest';
import { mockAnalyticsClient } from '../../mocks/index.js';
import type { MetricWindows, PlayerCard } from '../../types/analytics.js';
import type { Player, Roster } from '../../types/league.js';
import { trendsByPlayer, usageTrends } from './usage-trend.js';

function player(id: string, position = 'WR'): Player {
  return { externalPlayerId: id, fullName: id, position, nflTeam: null, injuryStatus: null, byeWeek: null, projectedPoints: null };
}

function card(metrics: Record<string, MetricWindows>): PlayerCard {
  return { pid: 1, name: 'x', position: 'WR', posGroup: 'WR', metrics };
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

describe('usageTrends', () => {
  it('reports a starter losing targets against this season', () => {
    const cards = new Map([['starter', card({ target_share: { last4: w(0.15, 4), season: w(0.26, 8) } })]]);
    const [trend] = usageTrends(roster, players, cards);
    expect(trend).toMatchObject({ playerId: 'starter', slot: 'starter', recent: 0.15, baseline: 0.26, major: false });
    expect(trend!.message).toBe('starter: target share 15% over the last 4 games, down from 26% this season');
  });

  it('compares against last season while the season is still short', () => {
    const cards = new Map([
      ['bench', card({ carry_share: { last4: w(0.47, 3), season: w(0.47, 3), prior: w(0.17, 16) } })],
    ]);
    const [trend] = usageTrends(roster, players, cards);
    expect(trend!.message).toBe('bench (bench): carry share 47% over the last 3 games, up from 17% last season');
  });

  it('reports both directions, strongest first, and marks moves of 2+ thresholds major', () => {
    const cards = new Map([
      ['starter', card({ target_share: { last4: w(0.3, 4), season: w(0.2, 8) } })], // +10 pts ≈ 1.4
      ['bench', card({ target_share: { last4: w(0.05, 4), season: w(0.2, 8) } })], // -15 pts ≈ 2.1
    ]);
    expect(usageTrends(roster, players, cards).map((t) => [t.playerId, t.major])).toEqual([
      ['bench', true],
      ['starter', false],
    ]);
  });

  it('stays quiet under the threshold, on thin samples, and for IR', () => {
    const cards = new Map([
      ['starter', card({ target_share: { last4: w(0.2, 4), season: w(0.25, 8) } })], // 5 pts < 7
      ['bench', card({ carry_share: { last4: w(0.6, 1), season: w(0.2, 8) } })], // one game
      ['ir', card({ target_share: { last4: w(0.0, 4), season: w(0.3, 8) } })],
    ]);
    expect(usageTrends(roster, players, cards)).toEqual([]);
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
    const trends = usageTrends(roster, players, cards);
    expect(trends).toHaveLength(1);
    expect(trends[0]!.message).toContain('snap share 50%');
  });

  it('finds both mock stories through the mock client', async () => {
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
    // Loomis's snap jump (37 pts) is major; Lang's target dip (11 pts) is real but minor.
    expect(usageTrends(mockRoster, mockPlayers, cards).map((t) => [t.playerId, t.major])).toEqual([
      ['p-ddf-bn1', true],
      ['p-ddf-wr2', false],
    ]);
  });
});

describe('trendsByPlayer', () => {
  const trend = (playerId: string, pid: number, strength: number) => ({
    playerId,
    pid,
    playerName: `pid ${pid}`,
    slot: 'starter' as const,
    metric: 'snap share',
    recent: 0.8,
    baseline: 0.4,
    baselineLabel: 'this season',
    games: 4,
    strength,
    major: strength >= 2,
    message: '',
  });

  it('merges one player across Sleeper and ESPN leagues, whose player IDs differ', () => {
    const entries = trendsByPlayer([
      { league: 'Sleeper league', trend: trend('11834', 7, 2.5) },
      { league: 'ESPN league', trend: trend('4569559', 7, 2.5) },
      { league: 'ESPN league', trend: trend('4612826', 8, 3) },
    ]);
    expect(entries.map((e) => [e.trend.pid, e.leagues])).toEqual([
      [8, ['ESPN league']],
      [7, ['Sleeper league', 'ESPN league']],
    ]);
  });
});
