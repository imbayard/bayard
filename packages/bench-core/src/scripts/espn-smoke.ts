import { LruCache } from '../cache/lru-cache.js';
import { EspnAdapter } from '../adapters/espn/adapter.js';
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
  const leagueId = process.env['ESPN_LEAGUE_ID'];
  const swid = process.env['ESPN_SWID'];
  const espnS2 = process.env['ESPN_S2'];
  const seasonStr = process.env['ESPN_SEASON'];
  const season = seasonStr ? Number(seasonStr) : new Date().getFullYear();

  if (!leagueId || !swid || !espnS2) {
    console.error(
      'Missing ESPN credentials. Set ESPN_LEAGUE_ID, ESPN_SWID, and ESPN_S2 env vars.',
    );
    process.exit(1);
  }

  const adapter = new EspnAdapter(new LruCache(), leagueId, season, swid, espnS2);

  // Resolve "my team" by matching SWID in owners[]
  const [teams, rosters, matchups, players, leagues] = await Promise.all([
    adapter.getTeams(leagueId),
    adapter.getRosters(leagueId),
    adapter.getMatchups(leagueId, 1),
    adapter.getPlayers(),
    adapter.getLeagues(swid, season),
  ]);

  if (leagues.length === 0) {
    console.error(`No ESPN leagues found for season ${season}.`);
    process.exit(1);
  }

  const league = leagues[0]!;
  const currentWeek = league.currentWeek;
  const week = currentWeek || 1;

  // Get matchups for current week
  const weekMatchups = await adapter.getMatchups(leagueId, week);

  // Identify "my team" via SWID
  const normalizedSwid = swid.toLowerCase().replace(/[{}]/g, '');
  const myTeam =
    teams.find((t) => {
      const ownerSwid = t.ownerExternalUserId.toLowerCase().replace(/[{}]/g, '');
      return ownerSwid === normalizedSwid;
    }) ?? teams[0];

  if (!myTeam) {
    console.error(`No teams found in ESPN league ${leagueId}.`);
    process.exit(1);
  }

  const myRoster = rosters.find((r) => r.externalTeamId === myTeam.externalTeamId);
  const myMatchup = weekMatchups.find((m) => m.externalTeamId === myTeam.externalTeamId);
  const opponentTeam = myMatchup?.opponentExternalTeamId
    ? teams.find((t) => t.externalTeamId === myMatchup.opponentExternalTeamId)
    : undefined;
  const opponentMatchup = myMatchup?.opponentExternalTeamId
    ? weekMatchups.find((m) => m.externalTeamId === myMatchup.opponentExternalTeamId)
    : undefined;

  const entries = myRoster?.entries ?? [];
  const summary = {
    user: { swid: normalizedSwid, leagueId },
    season,
    currentWeek: week,
    leagueCount: 1,
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
