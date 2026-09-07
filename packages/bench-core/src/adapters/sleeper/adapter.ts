import type { Cache } from '../../cache/cache.js';
import type { DraftBoard, League, Matchup, Player, Roster, Team } from '../../types/league.js';
import type { PlatformAdapter } from '../../types/platform.js';
import { starterSlotTypes } from '../../types/roster-slots.js';
import { SleeperClient } from './client.js';
import {
  mapDraft,
  mapDraftPicks,
  mapLeague,
  mapMatchups,
  mapPlayer,
  mapProjections,
  mapRoster,
  mapTeams,
  parseDraftStatus,
} from './mapper.js';
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
    const drafts = await Promise.all(leagues.map((l) => this.client.getDraftsForLeague(l.league_id)));
    return leagues.map((l, i) => {
      const draft = drafts[i]?.[0];
      const startTime = draft?.start_time ?? null;
      const draftDate = startTime != null ? new Date(startTime).toISOString() : null;
      return mapLeague(l, currentWeek, draftDate, parseDraftStatus(draft?.status));
    });
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

  /** The league's most recent draft plus every pick made so far; null if the league has no draft. */
  async getDraft(externalLeagueId: string): Promise<DraftBoard | null> {
    const drafts = await this.client.getDraftsForLeague(externalLeagueId);
    const summary = drafts[0];
    if (!summary) return null;

    // The list endpoint omits slot_to_roster_id, so the detail call is what makes picks
    // attributable to teams.
    const [detail, rawPicks] = await Promise.all([
      this.client.getDraft(summary.draft_id),
      this.client.getDraftPicks(summary.draft_id),
    ]);
    const draft = mapDraft(detail, rawPicks.length);
    return { draft, picks: mapDraftPicks(rawPicks, draft.slotByTeamId) };
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
