/**
 * Raw `GET /analytics/players/batch` fixture for the Dynasty Dumpster Fire roster
 * (mock-sleeper-2, whose games are all still to kick off, so nothing is locked), served by
 * `MockAnalyticsClient` in place of the Coach backend. Two stories:
 *  - Tobias Lang (starting WR) is losing targets: 15% over the last 4 vs 26% this season
 *    → a minor trend (behind the ticker's click).
 *  - Dexter Loomis (bench WR) has stepped into a starting role: 23% of targets over the
 *    last 3 vs 9% last season, snaps 79% vs 42% → a major trend (on the ticker).
 * Everyone else is steady, so nothing else trends.
 */
import type { AnalyticsBatchResponse } from '../../adapters/analytics/types.js';

type Windows = AnalyticsBatchResponse['players'][string]['metrics'][string];

const steady = (value: number, n = 6): Windows => ({
  week: { value, shrunk: value, n: 1, pct: 60 },
  last4: { value, shrunk: value, n: Math.min(4, n), pct: 60 },
  season: { value, shrunk: value, n, pct: 60 },
  prior: { value, shrunk: value, n: 17, pct: 60 },
});

const card = (pid: number, name: string, position: string, metrics: Record<string, Windows>) => ({
  pid,
  name,
  position,
  pos_group: position,
  metrics,
});

export const analyticsBatch: AnalyticsBatchResponse = {
  season: 2026,
  week: 6,
  as_of: '2026-10-20T11:00:00+00:00',
  players: {
    'p-ddf-qb': card(1, 'Wyatt Cobb', 'QB', { off_snap_pct: steady(0.99), carry_share: steady(0.12) }),
    'p-ddf-rb2': card(2, 'Chase Dumont', 'RB', {
      off_snap_pct: steady(0.64),
      carry_share: steady(0.55),
      target_share: steady(0.1),
    }),
    'p-ddf-wr2': card(3, 'Tobias Lang', 'WR', {
      off_snap_pct: steady(0.88),
      target_share: {
        week: { value: 0.13, shrunk: 0.18, n: 1, pct: 38 },
        last4: { value: 0.15, shrunk: 0.17, n: 4, pct: 44 },
        season: { value: 0.26, shrunk: 0.25, n: 6, pct: 91 },
        prior: { value: 0.24, shrunk: 0.24, n: 17, pct: 88 },
      },
    }),
    'p-ddf-te': card(4, 'Miles Anders', 'TE', { off_snap_pct: steady(0.8), target_share: steady(0.17) }),
    'p-ddf-bn1': card(5, 'Dexter Loomis', 'WR', {
      off_snap_pct: {
        week: { value: 0.84, shrunk: 0.72, n: 1, pct: 70 },
        last4: { value: 0.79, shrunk: 0.71, n: 3, pct: 66 },
        season: { value: 0.61, shrunk: 0.58, n: 5, pct: 40 },
        prior: { value: 0.42, shrunk: 0.42, n: 16, pct: 22 },
      },
      target_share: {
        week: { value: 0.25, shrunk: 0.18, n: 1, pct: 80 },
        last4: { value: 0.23, shrunk: 0.19, n: 3, pct: 74 },
        season: { value: 0.17, shrunk: 0.16, n: 5, pct: 55 },
        prior: { value: 0.09, shrunk: 0.09, n: 16, pct: 18 },
      },
    }),
  },
};
