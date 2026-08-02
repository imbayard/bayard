import { LruCache } from '../cache/lru-cache.js';
import { SleeperAdapter } from '../adapters/sleeper/adapter.js';
import { computeBenchIqFlags } from '../compute/flags/index.js';
import type { Player, RosterEntry } from '../types/league.js';

interface PlayerSummary {
  name: string;
  position: string;
  nflTeam: string | null;
  injuryStatus: string | null;
}

function summarize(entries: RosterEntry[], players: Map<string, Player>): PlayerSummary[] {
  return entries.map((e) => {
    const p = players.get(e.externalPlayerId);
    return {
      name: p?.fullName ?? e.externalPlayerId,
      position: p?.position ?? 'UNK',
      nflTeam: p?.nflTeam ?? null,
      injuryStatus: p?.injuryStatus ?? null,
    };
  });
}

async function main(): Promise<void> {
  const username = process.argv[2];
  if (!username) {
    console.error('Usage: pnpm --filter @benchpoints/core smoke <sleeper-username>');
    process.exit(1);
  }

  const adapter = new SleeperAdapter(new LruCache());

  const userId = await adapter.resolveUserId(username);
  const state = await adapter.getNflState();

  // In the offseason Sleeper's state points at the upcoming season, which may
  // have no leagues yet — fall back one season so the smoke test still proves
  // the pipeline.
  const stateSeason = Number(state.league_season ?? state.season);
  let season = stateSeason;
  let leagues = await adapter.getLeagues(userId, season);
  if (leagues.length === 0) {
    season = stateSeason - 1;
    leagues = await adapter.getLeagues(userId, season);
  }
  if (leagues.length === 0) {
    console.error(`No Sleeper leagues found for "${username}" in ${stateSeason} or ${season}.`);
    process.exit(1);
  }

  const league = leagues[0]!;
  // If we fell back to a past season, the live "current week" doesn't apply;
  // sample week 1 of that season instead.
  const week = season === stateSeason ? league.currentWeek : 1;

  const [teams, rosters, matchups, players, projections] = await Promise.all([
    adapter.getTeams(league.externalLeagueId),
    adapter.getRosters(league.externalLeagueId),
    adapter.getMatchups(league.externalLeagueId, week),
    adapter.getPlayers(),
    adapter.getProjections(season, week),
  ]);
  for (const [playerId, projectedPoints] of projections) {
    const player = players.get(playerId);
    if (player) player.projectedPoints = projectedPoints;
  }
  const rosteredPlayerIds = new Set(rosters.flatMap((r) => r.entries.map((e) => e.externalPlayerId)));

  const myTeam = teams.find((t) => t.ownerExternalUserId === userId) ?? teams[0];
  if (!myTeam) {
    console.error(`League "${league.name}" has no teams.`);
    process.exit(1);
  }

  const myRoster = rosters.find((r) => r.externalTeamId === myTeam.externalTeamId);
  const myMatchup = matchups.find((m) => m.externalTeamId === myTeam.externalTeamId);
  const opponentTeam = myMatchup?.opponentExternalTeamId
    ? teams.find((t) => t.externalTeamId === myMatchup.opponentExternalTeamId)
    : undefined;
  const opponentMatchup = myMatchup?.opponentExternalTeamId
    ? matchups.find((m) => m.externalTeamId === myMatchup.opponentExternalTeamId)
    : undefined;

  const entries = myRoster?.entries ?? [];
  const summary = {
    user: { username, userId },
    season,
    currentWeek: week,
    leagueCount: leagues.length,
    sampledLeague: {
      name: league.name,
      leagueType: league.leagueType,
      record: `${myTeam.wins}-${myTeam.losses}-${myTeam.ties}`,
      matchup: myMatchup
        ? {
            opponent: opponentTeam?.displayName ?? null,
            myPoints: myMatchup.points,
            opponentPoints: opponentMatchup?.points ?? null,
          }
        : null,
      starters: summarize(
        entries.filter((e) => e.slot === 'starter'),
        players,
      ),
      bench: summarize(
        entries.filter((e) => e.slot === 'bench'),
        players,
      ),
      projectionsFetched: projections.size,
      flags: myRoster ? computeBenchIqFlags(myRoster, players, week, league.rosterSlots, rosteredPlayerIds) : [],
    },
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Error: ${message}`);
  if (process.env['DEBUG'] === '1') {
    console.error(err);
  }
  process.exit(1);
});
