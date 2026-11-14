import type { League, Matchup, Platform, Team } from '@benchpoints/core';
import { Hono } from 'hono';
import { adapterFor } from '../adapters.js';
import { computeLeagueBenchIq, type BenchIqSummary } from '../lib/bench-iq.js';
import { resolveOwnerId } from '../lib/league-lookup.js';
import { enrichedMatchups } from '../lib/matchups.js';
import { isMockRequested } from '../lib/mock.js';
import { getEspnLeagues, getSleeperLeagues } from './leagues.js';

/** One league's slice of the deck: the same three payloads its per-league routes return. */
interface LeagueSummaryPayload {
  teams: Team[] | null;
  matchups: Matchup[] | null;
  benchIq: BenchIqSummary | null;
  error: string | null;
}

export const deck = new Hono();

/**
 * Everything the Command Deck renders, in one invocation. On Netlify each request can land on
 * its own cold instance, so the per-league fan-out (3 calls a league) re-fetched the player
 * pool, game states and weather per call; here they load once and every league shares them.
 * The per-league routes stay for league detail and everything else.
 */
deck.get('/deck', async (c) => {
  const useMock = isMockRequested(c);
  const platforms = ['sleeper', 'espn'] as const;
  const listed = await Promise.allSettled([getSleeperLeagues(useMock), getEspnLeagues(useMock)]);

  const leagues: League[] = [];
  const errors: { platform: Platform; error: string }[] = [];
  const work: Promise<[string, LeagueSummaryPayload]>[] = [];

  listed.forEach((result, i) => {
    const platform = platforms[i]!;
    if (result.status === 'rejected') {
      errors.push({ platform, error: message(result.reason) });
      return;
    }
    leagues.push(...result.value);
    // Only resolved when a league will await it, so a failure never goes unhandled.
    if (result.value.length === 0) return;
    const ownerId = resolveOwnerId(platform, useMock);
    for (const league of result.value) {
      work.push(summarizeLeague(platform, league, ownerId, useMock));
    }
  });

  return c.json({ leagues, errors, summaries: Object.fromEntries(await Promise.all(work)) });
});

/** Never rejects: one league failing (or one of its three parts) never blanks the others. */
async function summarizeLeague(
  platform: Platform,
  league: League,
  ownerId: Promise<string>,
  useMock: boolean,
): Promise<[string, LeagueSummaryPayload]> {
  const leagueId = league.externalLeagueId;
  const [teams, matchups, benchIq] = await Promise.allSettled([
    adapterFor(platform, useMock).getTeams(leagueId),
    enrichedMatchups(platform, leagueId, league.season, league.currentWeek, useMock),
    ownerId.then((id) => computeLeagueBenchIq(platform, league, id, useMock)),
  ]);

  const failures = [teams, matchups, benchIq]
    .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    .map((r) => message(r.reason));
  const summary = benchIq.status === 'fulfilled' ? (benchIq.value?.summary ?? null) : null;
  if (benchIq.status === 'fulfilled' && !summary) {
    failures.push(`Could not find your team in league "${leagueId}"`);
  }

  return [
    `${platform}:${leagueId}`,
    {
      teams: teams.status === 'fulfilled' ? teams.value : null,
      matchups: matchups.status === 'fulfilled' ? matchups.value : null,
      benchIq: summary,
      error: failures.length > 0 ? failures.join('; ') : null,
    },
  ];
}

function message(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}
