import type { Cache } from '../../cache/cache.js';
import type { League, Matchup, Player, Roster, Team } from '../../types/league.js';
import type { PlatformAdapter } from '../../types/platform.js';
import { EspnApiError, EspnClient } from './client.js';
import {
  mapLeague,
  mapMatchups,
  mapPlayer,
  mapProjections,
  mapRoster,
  mapSeasonAverages,
  mapWeekPoints,
  mapTeams,
} from './mapper.js';

export class EspnAdapter implements PlatformAdapter {
  readonly platform = 'espn' as const;
  private readonly client: EspnClient;
  private leagueIds: string[];
  private season: number;

  constructor(
    cache: Cache,
    leagueIds: string | string[],
    season: number,
    swid: string,
    espnS2: string,
    client?: EspnClient,
  ) {
    this.leagueIds = typeof leagueIds === 'string' ? [leagueIds] : [...leagueIds];
    this.season = season;
    this.client =
      client ??
      new EspnClient(cache, swid, espnS2);
  }

  /**
   * ESPN has no "list my leagues" endpoint, so the configured ids are the whole world here.
   * An id we were never given is a league we can't claim to own — 404 rather than fetch it.
   */
  private assertConfigured(externalLeagueId: string): string {
    if (!this.leagueIds.includes(externalLeagueId)) {
      throw new EspnApiError(`ESPN league "${externalLeagueId}" is not configured`, 404);
    }
    return externalLeagueId;
  }

  async resolveUserId(usernameOrId: string): Promise<string> {
    // ESPN doesn't have a username lookup — we identify users by SWID in team.owners[]
    // For now, this is a no-op; resolveUserId is handled at adapter construction.
    return usernameOrId;
  }

  async getLeagues(externalUserId: string, season: number): Promise<League[]> {
    // ESPN requires league ids upfront, so the ones configured at construction are the list.
    const raws = await Promise.all(this.leagueIds.map((id) => this.client.getLeague(id, season)));
    return raws.map(mapLeague);
  }

  async getTeams(externalLeagueId: string): Promise<Team[]> {
    const raw = await this.client.getLeague(this.assertConfigured(externalLeagueId), this.season);
    const teams = raw.teams ?? [];
    return mapTeams(teams);
  }

  async getRosters(externalLeagueId: string): Promise<Roster[]> {
    const raw = await this.client.getLeague(this.assertConfigured(externalLeagueId), this.season);
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
    const raw = await this.client.getLeague(this.assertConfigured(externalLeagueId), this.season);
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

  /**
   * ESPN applies the league's own scoring rules to the projection, so a caller with more than
   * one league has to say which — falling back to the first configured one when it doesn't.
   */
  async getProjections(
    season: number,
    week: number,
    externalLeagueId?: string,
  ): Promise<Map<string, number>> {
    const raw = await this.client.getPlayerProjections(this.leagueIdFor(externalLeagueId), season, week);
    return mapProjections(raw, week);
  }

  /** Reuses the response the projections call already cached — the week's actual line rides along. */
  async getWeekPoints(season: number, week: number, externalLeagueId: string): Promise<Map<string, number>> {
    const raw = await this.client.getPlayerProjections(this.leagueIdFor(externalLeagueId), season, week);
    return mapWeekPoints(raw, week);
  }

  /** Reuses the response the projections call already cached — the season line rides along in it. */
  async getSeasonAverages(
    season: number,
    throughWeek: number,
    externalLeagueId?: string,
  ): Promise<Map<string, number>> {
    const raw = await this.client.getPlayerProjections(
      this.leagueIdFor(externalLeagueId),
      season,
      throughWeek,
    );
    return mapSeasonAverages(raw);
  }

  private leagueIdFor(externalLeagueId?: string): string {
    return externalLeagueId ? this.assertConfigured(externalLeagueId) : this.leagueIds[0]!;
  }
}
