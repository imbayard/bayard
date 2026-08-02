import { describe, expect, it } from 'vitest';
import { computeBenchIqFlags } from '../compute/flags/index.js';
import { MOCK_SLEEPER_OWNER_ID } from './fixtures/sleeper.js';
import { MOCK_ESPN_OWNER_ID, MOCK_ESPN_LEAGUE_ID } from './fixtures/espn.js';
import { mockEspnAdapter, mockSleeperAdapter } from './index.js';

describe('mock adapters', () => {
  it('flags bench/waiver projections for the Redraft Rebels Sleeper league', async () => {
    const [league] = await mockSleeperAdapter.getLeagues(MOCK_SLEEPER_OWNER_ID, 2026);
    const rosters = await mockSleeperAdapter.getRosters('mock-sleeper-1');
    const roster = rosters.find((r) => r.externalTeamId === '1')!;
    const players = await mockSleeperAdapter.getPlayers();
    const projections = await mockSleeperAdapter.getProjections(2026, league!.currentWeek);
    for (const [playerId, projectedPoints] of projections) {
      const player = players.get(playerId);
      if (player) player.projectedPoints = projectedPoints;
    }
    const rosteredPlayerIds = new Set(rosters.flatMap((r) => r.entries.map((e) => e.externalPlayerId)));

    const flags = computeBenchIqFlags(roster, players, league!.currentWeek, league!.rosterSlots, rosteredPlayerIds);
    const types = flags.map((f) => f.type).sort();
    expect(types).toEqual(['BENCH_PLAYER_HIGHER_PROJECTION', 'WAIVER_PLAYER_HIGHER_PROJECTION']);
  });

  it('flags a bye-week starter and an inactive starter for the Dynasty Dumpster Fire Sleeper league', async () => {
    const leagues = await mockSleeperAdapter.getLeagues(MOCK_SLEEPER_OWNER_ID, 2026);
    const league = leagues.find((l) => l.externalLeagueId === 'mock-sleeper-2')!;
    const rosters = await mockSleeperAdapter.getRosters('mock-sleeper-2');
    const roster = rosters.find((r) => r.externalTeamId === '1')!;
    const players = await mockSleeperAdapter.getPlayers();

    const flags = computeBenchIqFlags(roster, players, league.currentWeek, league.rosterSlots);
    const types = flags.map((f) => f.type).sort();
    expect(types).toEqual(['BYE_WEEK_STARTER', 'STARTING_INACTIVE']);
  });

  it('flags an incomplete lineup for the ESPN league', async () => {
    const [league] = await mockEspnAdapter.getLeagues(MOCK_ESPN_OWNER_ID, 2026);
    const rosters = await mockEspnAdapter.getRosters(MOCK_ESPN_LEAGUE_ID);
    const roster = rosters.find((r) => r.externalTeamId === '1')!;
    const players = await mockEspnAdapter.getPlayers();

    const flags = computeBenchIqFlags(roster, players, league!.currentWeek, league!.rosterSlots);
    expect(flags.every((f) => f.type === 'INCOMPLETE_LINEUP')).toBe(true);
    expect(flags.length).toBeGreaterThan(0);
  });
});
