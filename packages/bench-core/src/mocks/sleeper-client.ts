import { LruCache } from '../cache/lru-cache.js';
import { SleeperClient } from '../adapters/sleeper/client.js';
import type {
  SleeperDraft,
  SleeperDraftPick,
  SleeperLeague,
  SleeperLeagueUser,
  SleeperMatchup,
  SleeperNflState,
  SleeperPlayersResponse,
  SleeperProjectionsResponse,
  SleeperRoster,
  SleeperSeasonStatsResponse,
  SleeperUser,
} from '../adapters/sleeper/types.js';
import {
  MOCK_SLEEPER_OWNER_ID,
  sleeperDraftPicksById,
  sleeperDraftsById,
  sleeperDraftsByLeagueId,
  sleeperLeaguesById,
  sleeperLeagueUsersById,
  sleeperMatchupsById,
  sleeperPlayers,
  sleeperProjections,
  sleeperRostersById,
  sleeperSeasonStats,
  sleeperState,
} from './fixtures/sleeper.js';
import {
  TRADE_LEAGUE_ID,
  tradeLeague,
  tradeLeagueUsers,
  tradePlayers,
  tradePriorSeasonStats,
  tradeRosters,
  tradeSeasonStats,
} from './fixtures/trades.js';

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
    return [...Object.values(sleeperLeaguesById), tradeLeague];
  }

  override async getLeague(leagueId: string): Promise<SleeperLeague> {
    const league = leagueId === TRADE_LEAGUE_ID ? tradeLeague : sleeperLeaguesById[leagueId];
    if (!league) throw new Error(`No mock Sleeper league "${leagueId}"`);
    return league;
  }

  override async getLeagueUsers(leagueId: string): Promise<SleeperLeagueUser[]> {
    if (leagueId === TRADE_LEAGUE_ID) return tradeLeagueUsers;
    return sleeperLeagueUsersById[leagueId] ?? [];
  }

  override async getRosters(leagueId: string): Promise<SleeperRoster[]> {
    if (leagueId === TRADE_LEAGUE_ID) return tradeRosters;
    return sleeperRostersById[leagueId] ?? [];
  }

  override async getDraftsForLeague(leagueId: string): Promise<SleeperDraft[]> {
    return sleeperDraftsByLeagueId[leagueId] ?? [];
  }

  override async getDraft(draftId: string): Promise<SleeperDraft> {
    const draft = sleeperDraftsById[draftId];
    if (!draft) throw new Error(`No mock Sleeper draft "${draftId}"`);
    return draft;
  }

  override async getDraftPicks(draftId: string): Promise<SleeperDraftPick[]> {
    return sleeperDraftPicksById[draftId] ?? [];
  }

  override async getMatchups(leagueId: string): Promise<SleeperMatchup[]> {
    return sleeperMatchupsById[leagueId] ?? [];
  }

  override async getPlayers(): Promise<SleeperPlayersResponse> {
    return { ...sleeperPlayers, ...tradePlayers };
  }

  override async getProjections(): Promise<SleeperProjectionsResponse> {
    return sleeperProjections;
  }

  override async getSeasonStats(season: number): Promise<SleeperSeasonStatsResponse> {
    if (season < Number(sleeperState.season)) return tradePriorSeasonStats;
    return { ...sleeperSeasonStats, ...tradeSeasonStats };
  }
}
