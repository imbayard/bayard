import { describe, expect, it } from 'vitest';
import type { League, Matchup, Player, Roster } from '../types/league.js';
import {
  buildDigest,
  buildInjurySection,
  buildProjectionsSection,
  buildRecordSection,
  buildWaiverSection,
  renderDigestEmail,
  type LeagueDigestEntry,
} from './digest.js';
import { injuryReport } from './injury.js';
import { formatRecord, matchupResult, tallyResults } from './results.js';
import type { BenchIqFlag } from './types.js';

function league(name: string): League {
  return {
    platform: 'sleeper',
    externalLeagueId: name,
    name,
    season: 2026,
    scoringFormat: {},
    leagueType: 'redraft',
    rosterSlots: ['QB', 'RB', 'BN'],
    teamCount: 10,
    currentWeek: 5,
    draftDate: null,
    draftStatus: null,
  };
}

function entry(overrides: Partial<LeagueDigestEntry> = {}): LeagueDigestEntry {
  return {
    league: league('Test League'),
    flags: [],
    injuries: [],
    projectedPoints: null,
    opponentProjectedPoints: null,
    opponentName: null,
    lastWeekResult: null,
    weather: [],
    ...overrides,
  };
}

function waiverFlag(playerName: string, starterName: string, delta: number): BenchIqFlag {
  return {
    type: 'WAIVER_PLAYER_HIGHER_PROJECTION',
    level: 'warning',
    playerId: playerName,
    playerName,
    slot: 'RB',
    message: `${playerName} outprojects ${starterName}`,
    delta,
    starterName,
  };
}

function matchup(teamId: string, opponentId: string | null, points: number): Matchup {
  return {
    week: 4,
    externalTeamId: teamId,
    opponentExternalTeamId: opponentId,
    points,
    projectedPoints: null,
    anyStarterStarted: true,
    firstStarterKickoff: null,
    firstPlayerKickoff: null,
  };
}

describe('buildProjectionsSection', () => {
  it('shows the margin against the opponent', () => {
    const section = buildProjectionsSection([
      entry({ projectedPoints: 112.4, opponentProjectedPoints: 108.1, opponentName: 'Rivals' }),
    ]);
    expect(section.lines[0]).toBe('Test League — 112.4 vs 108.1 Rivals (+4.3)');
  });

  it('signs a deficit negative', () => {
    const section = buildProjectionsSection([
      entry({ projectedPoints: 100, opponentProjectedPoints: 110, opponentName: 'Rivals' }),
    ]);
    expect(section.lines[0]).toContain('(-10.0)');
  });

  it('drops the comparison on a bye', () => {
    const section = buildProjectionsSection([entry({ projectedPoints: 99.5 })]);
    expect(section.lines[0]).toBe('Test League — 99.5 projected');
  });

  it('shows no margin when my own projection is missing', () => {
    const section = buildProjectionsSection([
      entry({ projectedPoints: null, opponentProjectedPoints: 18.9, opponentName: 'Rivals' }),
    ]);
    expect(section.lines[0]).toBe('Test League — — vs 18.9 Rivals');
  });
});

describe('buildInjurySection', () => {
  it('reports starters before bench and worse statuses first', () => {
    const section = buildInjurySection([
      entry({
        injuries: [
          { playerName: 'A Back', position: 'RB', status: 'Out', starting: true },
          { playerName: 'B Catch', position: 'WR', status: 'Questionable', starting: false },
        ],
      }),
    ]);
    expect(section.lines[1]).toContain('Out — RB A Back (starting)');
    expect(section.lines[2]).toContain('Questionable — WR B Catch (bench)');
  });

  it('says so plainly when nobody is hurt', () => {
    expect(buildInjurySection([entry()]).lines).toEqual(['No injuries reported.']);
  });
});

describe('buildRecordSection', () => {
  it('aggregates the week across leagues', () => {
    const section = buildRecordSection([
      entry({ league: league('One'), lastWeekResult: 'win' }),
      entry({ league: league('Two'), lastWeekResult: 'loss' }),
      entry({ league: league('Three'), lastWeekResult: 'win' }),
    ]);
    expect(section.lines[0]).toBe('Overall: 2-1');
  });

  it('skips leagues whose week could not be judged', () => {
    const section = buildRecordSection([
      entry({ league: league('One'), lastWeekResult: 'win' }),
      entry({ league: league('Bye'), lastWeekResult: null }),
    ]);
    expect(section.lines[0]).toBe('Overall: 1-0');
    expect(section.lines.some((l) => l.includes('Bye'))).toBe(false);
  });
});

describe('buildWaiverSection', () => {
  it('ranks by delta, biggest edge first', () => {
    const section = buildWaiverSection([
      entry({ flags: [waiverFlag('Small Edge', 'Starter', 3.2), waiverFlag('Big Edge', 'Starter', 9.7)] }),
    ]);
    expect(section.lines[1]).toContain('Big Edge');
    expect(section.lines[2]).toContain('Small Edge');
  });

  it('ignores non-waiver flags', () => {
    const benchFlag: BenchIqFlag = { ...waiverFlag('Benched', 'Starter', 5), type: 'BENCH_PLAYER_HIGHER_PROJECTION' };
    const section = buildWaiverSection([entry({ flags: [benchFlag] })]);
    expect(section.lines).toEqual(['Nothing on the wire clears the threshold.']);
  });
});

describe('buildDigest', () => {
  it('pre-game carries projections, flags and injuries', () => {
    const titles = buildDigest('pre-game', [entry()]).map((s) => s.title);
    expect(titles).toEqual(['Projections', 'Flags', 'Injury report', 'Weather']);
  });

  it('post-game carries the record and waivers', () => {
    const titles = buildDigest('post-game', [entry()]).map((s) => s.title);
    expect(titles).toEqual(['Last week', 'Waiver targets']);
  });

  it('titles the email by kind', () => {
    expect(renderDigestEmail('pre-game', []).subject).toBe('Heads up — games starting');
    expect(renderDigestEmail('post-game', []).subject).toBe('Week review');
  });
});

describe('matchupResult', () => {
  it('reads a win, a loss and a tie', () => {
    const rows = [matchup('me', 'them', 110), matchup('them', 'me', 100)];
    expect(matchupResult(rows, 'me')).toBe('win');
    expect(matchupResult(rows, 'them')).toBe('loss');
    expect(matchupResult([matchup('me', 'them', 100), matchup('them', 'me', 100)], 'me')).toBe('tie');
  });

  it('returns null on a bye or a missing opponent row', () => {
    expect(matchupResult([matchup('me', null, 110)], 'me')).toBeNull();
    expect(matchupResult([matchup('me', 'them', 110)], 'me')).toBeNull();
    expect(matchupResult([], 'me')).toBeNull();
  });
});

describe('record helpers', () => {
  it('tallies and formats, hiding a zero tie count', () => {
    expect(formatRecord(tallyResults(['win', 'loss', 'win', null]))).toBe('2-1');
    expect(formatRecord(tallyResults(['win', 'tie']))).toBe('1-0-1');
  });
});

describe('injuryReport', () => {
  const players = new Map<string, Player>([
    ['1', { externalPlayerId: '1', fullName: 'Hurt Starter', position: 'RB', nflTeam: 'BUF', injuryStatus: 'Questionable', projectedPoints: null, byeWeek: null }],
    ['2', { externalPlayerId: '2', fullName: 'Out Bench', position: 'WR', nflTeam: 'KC', injuryStatus: 'Out', projectedPoints: null, byeWeek: null }],
    ['3', { externalPlayerId: '3', fullName: 'Healthy', position: 'QB', nflTeam: 'MIA', injuryStatus: null, projectedPoints: null, byeWeek: null }],
  ]);

  it('screens out healthy markers that slipped past an adapter', () => {
    const withHealthy = new Map(players);
    withHealthy.set('4', {
      externalPlayerId: '4',
      fullName: 'Fine Guy',
      position: 'TE',
      nflTeam: 'DAL',
      injuryStatus: 'Active',
      projectedPoints: null,
      byeWeek: null,
    });
    const roster: Roster = {
      externalTeamId: 'me',
      entries: [
        { externalPlayerId: '4', slot: 'starter' },
        { externalPlayerId: '1', slot: 'starter' },
      ],
    };
    expect(injuryReport(roster, withHealthy).map((r) => r.playerName)).toEqual(['Hurt Starter']);
  });

  it('puts an injured starter above a worse-off bench player', () => {
    const roster: Roster = {
      externalTeamId: 'me',
      entries: [
        { externalPlayerId: '2', slot: 'bench' },
        { externalPlayerId: '1', slot: 'starter' },
        { externalPlayerId: '3', slot: 'starter' },
      ],
    };
    const report = injuryReport(roster, players);
    expect(report.map((r) => r.playerName)).toEqual(['Hurt Starter', 'Out Bench']);
  });
});
