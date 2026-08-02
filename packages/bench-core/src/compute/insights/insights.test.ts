import { describe, expect, it } from 'vitest';
import type { TeamOLineAggregate } from '../../types/nflverse.js';
import { computeBenchIqInsights } from './index.js';
import { oLineInsights, oLineRatings } from './o-line-rating.js';

function aggregate(overrides: Partial<TeamOLineAggregate> & { team: string }): TeamOLineAggregate {
  return {
    dropbacks: 100,
    sacks: 0,
    rushAttempts: 100,
    rushEpaSum: 0,
    ...overrides,
  };
}

describe('oLineRatings', () => {
  it('normalizes best/middle/worst to 100/50/0 and ranks 1..N', () => {
    const aggregates: TeamOLineAggregate[] = [
      // sackRate 0.02 (best), meanEpa 0.10 (best)
      aggregate({ team: 'AAA', sacks: 2, rushEpaSum: 10 }),
      // sackRate 0.05 (middle), meanEpa 0.00 (middle)
      aggregate({ team: 'BBB', sacks: 5, rushEpaSum: 0 }),
      // sackRate 0.08 (worst), meanEpa -0.10 (worst)
      aggregate({ team: 'CCC', sacks: 8, rushEpaSum: -10 }),
    ];

    expect(oLineRatings(aggregates)).toEqual([
      { team: 'AAA', passBlock: 100, runBlock: 100, passRank: 1, runRank: 1 },
      { team: 'BBB', passBlock: 50, runBlock: 50, passRank: 2, runRank: 2 },
      { team: 'CCC', passBlock: 0, runBlock: 0, passRank: 3, runRank: 3 },
    ]);
  });

  it('gives everyone 50 and rank 1 when the league has no spread (divide-by-zero guard)', () => {
    const aggregates: TeamOLineAggregate[] = [
      aggregate({ team: 'AAA', sacks: 5, rushEpaSum: 5 }),
      aggregate({ team: 'BBB', sacks: 5, rushEpaSum: 5 }),
    ];

    expect(oLineRatings(aggregates)).toEqual([
      { team: 'AAA', passBlock: 50, runBlock: 50, passRank: 1, runRank: 1 },
      { team: 'BBB', passBlock: 50, runBlock: 50, passRank: 1, runRank: 1 },
    ]);
  });

  it('treats a team with no data as worst-in-league (zero-data guard)', () => {
    const aggregates: TeamOLineAggregate[] = [
      aggregate({ team: 'AAA', sacks: 2, rushEpaSum: 10 }), // best
      aggregate({ team: 'BBB', sacks: 8, rushEpaSum: -10 }), // worst real
      // No dropbacks and no rush attempts → treated as worst, tying BBB at 0.
      aggregate({ team: 'ZZZ', dropbacks: 0, sacks: 0, rushAttempts: 0, rushEpaSum: 0 }),
    ];

    expect(oLineRatings(aggregates)).toEqual([
      { team: 'AAA', passBlock: 100, runBlock: 100, passRank: 1, runRank: 1 },
      { team: 'BBB', passBlock: 0, runBlock: 0, passRank: 2, runRank: 2 },
      { team: 'ZZZ', passBlock: 0, runBlock: 0, passRank: 2, runRank: 2 },
    ]);
  });
});

describe('oLineInsights', () => {
  it('wraps each rating as a neutral team-scoped insight with no level', () => {
    const aggregates: TeamOLineAggregate[] = [aggregate({ team: 'AAA', sacks: 2, rushEpaSum: 10 })];

    expect(oLineInsights(aggregates)).toEqual([
      {
        type: 'OLINE_RATING',
        scope: 'team',
        team: 'AAA',
        data: { team: 'AAA', passBlock: 50, runBlock: 50, passRank: 1, runRank: 1 },
      },
    ]);
  });
});

describe('computeBenchIqInsights', () => {
  it('aggregates the O-Line insights', () => {
    const aggregates: TeamOLineAggregate[] = [
      aggregate({ team: 'AAA', sacks: 2, rushEpaSum: 10 }),
      aggregate({ team: 'BBB', sacks: 8, rushEpaSum: -10 }),
    ];

    const insights = computeBenchIqInsights(aggregates);

    expect(insights).toHaveLength(2);
    expect(insights.map((i) => i.type)).toEqual(['OLINE_RATING', 'OLINE_RATING']);
    expect(insights[0]).toEqual({
      type: 'OLINE_RATING',
      scope: 'team',
      team: 'AAA',
      data: { team: 'AAA', passBlock: 100, runBlock: 100, passRank: 1, runRank: 1 },
    });
  });
});
