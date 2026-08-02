import type { Cache } from '../../cache/cache.js';
import type { League, Matchup, Player, Roster, Team } from '../../types/league.js';
import type { PlatformAdapter } from '../../types/platform.js';
import { starterSlotTypes } from '../../types/roster-slots.js';
import { SleeperClient } from './client.js';
import { mapLeague, mapMatchups, mapPlayer, mapProjections, mapRoster, mapTeams } from './mapper.js';
import type { SleeperNflState } from './types.js';

export class SleeperAdapter implements PlatformAdapter {
  readonly platform = 'sleeper' as const;
  private readonly client: SleeperClient;

  constructor(cache: Cache, client?: SleeperClient) {
    this.client = client ?? new SleeperClient(cache);
  }

  async resolveUserId(usernameOrId: string): Promise<string> {
    const user = await this.client.getUser(usernameOrId);
    return user.user_id;
  }

  /** Sleeper-specific extra (not on PlatformAdapter): current NFL season/week. */
  getNflState(): Promise<SleeperNflState> {
    return this.client.getNflState();
  }

  async getLeagues(externalUserId: string, season: number): Promise<League[]> {
    const [state, leagues] = await Promise.all([
      this.client.getNflState(),
      this.client.getLeagues(externalUserId, season),
    ]);
    const currentWeek = Math.max(1, state.week);
    return leagues.map((l) => mapLeague(l, currentWeek));
  }

  async getTeams(externalLeagueId: string): Promise<Team[]> {
    const [rosters, users] = await Promise.all([
      this.client.getRosters(externalLeagueId),
      this.client.getLeagueUsers(externalLeagueId),
    ]);
    return mapTeams(rosters, users);
  }

  async getRosters(externalLeagueId: string): Promise<Roster[]> {
    const [rosters, league] = await Promise.all([
      this.client.getRosters(externalLeagueId),
      this.client.getLeague(externalLeagueId),
    ]);
    const slots = starterSlotTypes(league.roster_positions ?? []);
    return rosters.map((r) => mapRoster(r, slots));
  }

  async getMatchups(externalLeagueId: string, week: number): Promise<Matchup[]> {
    const matchups = await this.client.getMatchups(externalLeagueId, week);
    return mapMatchups(matchups, week);
  }

  async getPlayers(): Promise<Map<string, Player>> {
    const raw = await this.client.getPlayers();
    const players = new Map<string, Player>();
    for (const [id, p] of Object.entries(raw)) {
      players.set(id, mapPlayer(id, p));
    }
    return players;
  }

  async getProjections(season: number, week: number): Promise<Map<string, number>> {
    const raw = await this.client.getProjections(season, week);
    return mapProjections(raw);
  }
}
