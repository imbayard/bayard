import { LruCache } from '../cache/lru-cache.js';
import { SleeperClient } from '../adapters/sleeper/client.js';
import type {
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperNflState,
  SleeperPlayersResponse,
  SleeperProjectionsResponse,
  SleeperRoster,
  SleeperUser,
} from '../adapters/sleeper/types.js';
import {
  MOCK_SLEEPER_OWNER_ID,
  sleeperLeaguesById,
  sleeperLeagueUsersById,
  sleeperMatchupsById,
  sleeperPlayers,
  sleeperProjections,
  sleeperRostersById,
  sleeperState,
} from './fixtures/sleeper.js';

/**
 * Serves the raw fixtures in `./fixtures/sleeper.ts` in place of real HTTP calls. Subclasses the
 * real `SleeperClient` and overrides every method, so `SleeperAdapter` — and its mapper — run
 * completely unmodified against this data; mock mode exercises the exact same normalization
 * pipeline as production, just with the fetch swapped out at the root.
 */
export class MockSleeperClient extends SleeperClient {
  constructor() {
    super(new LruCache());
  }

  override async getUser(): Promise<SleeperUser> {
    return { user_id: MOCK_SLEEPER_OWNER_ID, username: 'mock-sleeper-owner', display_name: 'Mock Sleeper Owner', avatar: null };
  }

  override async getNflState(): Promise<SleeperNflState> {
    return sleeperState;
  }

  override async getLeagues(): Promise<SleeperLeague[]> {
    return Object.values(sleeperLeaguesById);
  }

  override async getLeague(leagueId: string): Promise<SleeperLeague> {
    const league = sleeperLeaguesById[leagueId];
    if (!league) throw new Error(`No mock Sleeper league "${leagueId}"`);
    return league;
  }

  override async getLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[]> {
    return sleeperLeagueUsersById[leagueId] ?? [];
  }

  override async getRosters(leagueId: string): Promise<SleeperRoster[]> {
    return sleeperRostersById[leagueId] ?? [];
  }

  override async getMatchups(leagueId: string): Promise<SleeperMatchup[]> {
    return sleeperMatchupsById[leagueId] ?? [];
  }

  override async getPlayers(): Promise<SleeperPlayersResponse> {
    return sleeperPlayers;
  }

  override async getProjections(): Promise<SleeperProjectionsResponse> {
    return sleeperProjections;
  }
}
