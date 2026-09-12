import type { League, NflWeekOpponent, Player } from '@benchpoints/core';
import {
  blendGiveaway,
  offenseGiveawayRatings,
  priorSeasonWeight,
  scoutFrame,
} from '@benchpoints/core';
import { Hono } from 'hono';
import { adapterFor, nflScheduleFor, nflverseFor } from '../adapters.js';
import { findLeague } from '../lib/league-lookup.js';
import { isMockRequested } from '../lib/mock.js';
import { parsePlatform } from '../lib/platform.js';

export const scout = new Hono();

/** v1 scouts defenses only — every other position needs the player-week aggregate. */
const SUPPORTED_POSITIONS = ['DEF'] as const;
const LAST_REGULAR_WEEK = 18;
/** Schedule strength decays fast; past this a frame is noise, and nobody holds a streamer that long. */
const MAX_FRAME_WEEKS = 6;

class BadRequestError extends Error {}

interface ScoutQuery {
  position: string;
  weeks: number[];
  pool: 'waivers' | 'roster';
}

function parseQuery(
  raw: { position?: string; from?: string; to?: string; pool?: string },
  currentWeek: number,
): ScoutQuery {
  const position = (raw.position ?? 'DEF').toUpperCase();
  if (!SUPPORTED_POSITIONS.includes(position as (typeof SUPPORTED_POSITIONS)[number])) {
    throw new BadRequestError(
      `Position "${position}" isn't scoutable yet. Supported: ${SUPPORTED_POSITIONS.join(', ')}.`,
    );
  }

  const pool = raw.pool ?? 'waivers';
  if (pool !== 'waivers' && pool !== 'roster') {
    throw new BadRequestError(`Unknown pool "${pool}". Expected "waivers" or "roster".`);
  }

  // An omitted frame means "this week".
  const from = raw.from === undefined ? currentWeek : Number(raw.from);
  const to = raw.to === undefined ? from : Number(raw.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    throw new BadRequestError('"from" and "to" must be whole week numbers.');
  }
  if (from < 1 || to > LAST_REGULAR_WEEK) {
    throw new BadRequestError(`Weeks must fall between 1 and ${LAST_REGULAR_WEEK}.`);
  }
  if (to < from) {
    throw new BadRequestError('"to" must not precede "from".');
  }
  if (to - from + 1 > MAX_FRAME_WEEKS) {
    throw new BadRequestError(`A frame spans at most ${MAX_FRAME_WEEKS} weeks.`);
  }

  const weeks = [];
  for (let week = from; week <= to; week++) weeks.push(week);
  return { position, weeks, pool };
}

/**
 * League-normalized ratings of every NFL offense, as of `statsThroughWeek`. Early in a
 * season that's barely any sample, so last season is blended in on a decaying weight —
 * and skipped entirely (one fewer download) once the current season stands on its own.
 */
async function ratingsAsOf(season: number, statsThroughWeek: number, useMock: boolean) {
  const client = nflverseFor(useMock);
  // At week N, N-1 games are in the books — which is exactly what `statsThroughWeek` counts.
  const weight = priorSeasonWeight(statsThroughWeek + 1);
  const [current, prior] = await Promise.all([
    client.getGiveawayAggregates(season, statsThroughWeek),
    weight > 0 ? client.getGiveawayAggregates(season - 1) : Promise.resolve([]),
  ]);
  return { ratings: offenseGiveawayRatings(blendGiveaway(current, prior, weight)), weight };
}

/** The pool of players this report ranks: unrostered league-wide, or the owner's own bench+starters. */
function candidatesFor(
  pool: 'waivers' | 'roster',
  position: string,
  players: Map<string, Player>,
  rosteredPlayerIds: Set<string>,
  myPlayerIds: Set<string>,
): Player[] {
  const inPool = (p: Player): boolean =>
    pool === 'waivers' ? !rosteredPlayerIds.has(p.externalPlayerId) : myPlayerIds.has(p.externalPlayerId);
  return [...players.values()].filter((p) => p.position === position && inPool(p));
}

scout.get('/leagues/:platform/:leagueId/scout', async (c) => {
  const platform = parsePlatform(c.req.param('platform'));
  const leagueId = c.req.param('leagueId');
  const useMock = isMockRequested(c);
  const adapter = adapterFor(platform, useMock);

  const lookup = await findLeague(platform, leagueId, useMock);
  if (!lookup) {
    return c.json({ error: `League "${leagueId}" not found` }, 404);
  }
  const { league, ownerExternalUserId } = lookup;

  let query: ScoutQuery;
  try {
    query = parseQuery(
      {
        position: c.req.query('position'),
        from: c.req.query('from'),
        to: c.req.query('to'),
        pool: c.req.query('pool'),
      },
      league.currentWeek,
    );
  } catch (err) {
    if (err instanceof BadRequestError) return c.json({ error: err.message }, 400);
    throw err;
  }
  const { weeks, position, pool } = query;

  // Never grade a week using its own result: cut the sample off before the frame opens.
  const statsThroughWeek = Math.max(0, Math.min(league.currentWeek, (weeks[0] as number) - 1));

  const [teams, rosters, players, { ratings, weight }, opponentsByWeek, projectionsByWeek] =
    await Promise.all([
      adapter.getTeams(leagueId),
      adapter.getRosters(leagueId),
      adapter.getPlayers(),
      ratingsAsOf(league.season, statsThroughWeek, useMock),
      weekOpponents(league, weeks, useMock),
      currentWeekProjections(adapter, league, weeks),
    ]);

  const myTeam = teams.find(
    (t) => t.ownerExternalUserId.toLowerCase() === ownerExternalUserId.toLowerCase(),
  );
  const myRoster = myTeam
    ? rosters.find((r) => r.externalTeamId === myTeam.externalTeamId)
    : undefined;
  if (pool === 'roster' && !myRoster) {
    return c.json({ error: `Could not find your team in league "${leagueId}"` }, 404);
  }

  const rosteredPlayerIds = new Set(rosters.flatMap((r) => r.entries.map((e) => e.externalPlayerId)));
  const myPlayerIds = new Set(myRoster?.entries.map((e) => e.externalPlayerId) ?? []);

  const candidates = scoutFrame({
    candidates: candidatesFor(pool, position, players, rosteredPlayerIds, myPlayerIds),
    weeks,
    opponentsByWeek,
    ratings,
    projectionsByWeek,
  });

  return c.json({
    position,
    weeks,
    pool,
    candidates,
    meta: {
      season: league.season,
      currentWeek: league.currentWeek,
      statsThroughWeek,
      priorSeasonWeight: weight,
    },
  });
});

/** One scoreboard request per week of the frame; each is cached for six hours. */
async function weekOpponents(
  league: League,
  weeks: number[],
  useMock: boolean,
): Promise<Map<number, Map<string, NflWeekOpponent>>> {
  const client = nflScheduleFor(useMock);
  const slates = await Promise.all(weeks.map((week) => client.getWeekOpponents(league.season, week)));
  return new Map(weeks.map((week, i) => [week, slates[i] as Map<string, NflWeekOpponent>]));
}

/**
 * Platform projections, for the current week only — no platform projects reliably past it,
 * and a made-up forward number would read as authoritative next to the real one.
 */
async function currentWeekProjections(
  adapter: ReturnType<typeof adapterFor>,
  league: League,
  weeks: number[],
): Promise<Map<number, Map<string, number>>> {
  if (!weeks.includes(league.currentWeek)) return new Map();
  const projections = await adapter.getProjections(league.season, league.currentWeek);
  return new Map([[league.currentWeek, projections]]);
}
