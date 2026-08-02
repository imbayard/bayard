import type { Cache } from '../../cache/cache.js';
import type { League, Matchup, Player, Roster, Team } from '../../types/league.js';
import type { PlatformAdapter } from '../../types/platform.js';
import { EspnClient } from './client.js';
import {
  mapLeague,
  mapMatchups,
  mapPlayer,
  mapProjections,
  mapRoster,
  mapTeams,
} from './mapper.js';

export class EspnAdapter implements PlatformAdapter {
  readonly platform = 'espn' as const;
  private readonly client: EspnClient;
  private leagueId: string;
  private season: number;

  constructor(
    cache: Cache,
    leagueId: string,
    season: number,
    swid: string,
    espnS2: string,
    client?: EspnClient,
  ) {
    this.leagueId = leagueId;
    this.season = season;
    this.client =
      client ??
      new EspnClient(cache, swid, espnS2);
  }

  async resolveUserId(usernameOrId: string): Promise<string> {
    // ESPN doesn't have a username lookup — we identify users by SWID in team.owners[]
    // For now, this is a no-op; resolveUserId is handled at adapter construction.
    return usernameOrId;
  }

  async getLeagues(externalUserId: string, season: number): Promise<League[]> {
    // ESPN requires league ID upfront. Multi-league discovery is future work.
    // For now, return the league passed at construction.
    const raw = await this.client.getLeague(this.leagueId, season);
    return [mapLeague(raw)];
  }

  async getTeams(externalLeagueId: string): Promise<Team[]> {
    const raw = await this.client.getLeague(this.leagueId, this.season);
    const teams = raw.teams ?? [];
    return mapTeams(teams);
  }

  async getRosters(externalLeagueId: string): Promise<Roster[]> {
    const raw = await this.client.getLeague(this.leagueId, this.season);
    const teams = raw.teams ?? [];
    const leagueRosterSlots = raw.settings?.rosterSettings.lineupSlotCounts ?? {};

    // Expand roster slots for position mapping
    const slots: string[] = [];
    const sortedIds = Object.keys(leagueRosterSlots)
      .map(Number)
      .sort((a, b) => a - b);
    for (const id of sortedIds) {
      const count = leagueRosterSlots[id]!;
      for (let i = 0; i < count; i++) {
        slots.push(''); // Not used in mapRoster
      }
    }

    return teams.map((t) => mapRoster(t, slots));
  }

  async getMatchups(externalLeagueId: string, week: number): Promise<Matchup[]> {
    const raw = await this.client.getLeague(this.leagueId, this.season);
    return mapMatchups(raw, week);
  }

  async getPlayers(): Promise<Map<string, Player>> {
    const raw = await this.client.getPlayerPool(this.season);
    const players = new Map<string, Player>();

    for (const p of raw) {
      players.set(String(p.id), mapPlayer(p.id, p));
    }

    return players;
  }

  async getProjections(season: number, week: number): Promise<Map<string, number>> {
    const raw = await this.client.getPlayerProjections(this.leagueId, season, week);
    return mapProjections(raw, week);
  }
}
