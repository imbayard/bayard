import type { DigestKind, League, LeagueDigestEntry, Platform } from '@benchpoints/core';
import {
  buildDigest,
  injuryReport,
  matchupResult,
  renderDigestEmail,
  weatherExposure,
} from '@benchpoints/core';
import { adapterFor } from '../adapters.js';
import { getEspnLeagues, getSleeperLeagues } from '../routes/leagues.js';
import { computeLeagueBenchIq } from './bench-iq.js';
import { sendDigestEmail } from './integrations.js';
import { resolveOwnerId } from './league-lookup.js';
import { sumStarterProjections } from './projections.js';

/**
 * When each digest goes out, in the owner's own wall-clock time.
 *
 * Deliberately not cron expressions: Netlify schedules in UTC, and these times straddle the
 * EDT/EST switch that lands mid-season — "Thursday 7pm" is 23:00 UTC Thursday in October and
 * 00:00 UTC *Friday* in December, which no single cron expression covers. The scheduled
 * function instead wakes every half hour and checks this table against New York local time.
 */
export const DIGEST_SCHEDULE: { kind: DigestKind; weekday: string; hour: number; minute: number }[] = [
  { kind: 'pre-game', weekday: 'Thu', hour: 19, minute: 0 },
  { kind: 'pre-game', weekday: 'Sun', hour: 12, minute: 30 },
  { kind: 'pre-game', weekday: 'Mon', hour: 19, minute: 0 },
  { kind: 'post-game', weekday: 'Tue', hour: 13, minute: 0 },
];

export const DIGEST_TIMEZONE = 'America/New_York';

/** Half-hour window, matching the scheduled function's cadence — a late cron still fires once. */
const SLOT_MINUTES = 30;

function localParts(now: Date): { weekday: string; minutesOfDay: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: DIGEST_TIMEZONE,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    weekday: get('weekday'),
    minutesOfDay: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Which digest (if any) this moment falls into. Null on the great majority of wake-ups. */
export function dueDigest(now: Date): DigestKind | null {
  const { weekday, minutesOfDay } = localParts(now);
  const slot = DIGEST_SCHEDULE.find((s) => {
    if (s.weekday !== weekday) return false;
    const target = s.hour * 60 + s.minute;
    return minutesOfDay >= target && minutesOfDay < target + SLOT_MINUTES;
  });
  return slot?.kind ?? null;
}

async function buildEntry(
  kind: DigestKind,
  platform: Platform,
  league: League,
  ownerExternalUserId: string,
  useMock: boolean,
): Promise<LeagueDigestEntry | null> {
  const benchIq = await computeLeagueBenchIq(platform, league, ownerExternalUserId, useMock);
  if (!benchIq) return null;

  const { summary, roster, rosters, players, teams, weather } = benchIq;
  const adapter = adapterFor(platform, useMock);

  const entry: LeagueDigestEntry = {
    league,
    flags: summary.flags,
    trends: kind === 'pre-game' ? summary.trends : [],
    injuries: kind === 'pre-game' ? injuryReport(roster, players) : [],
    projectedPoints: summary.projectedPoints,
    opponentProjectedPoints: null,
    opponentName: null,
    lastWeekResult: null,
    weather: kind === 'pre-game' ? weatherExposure(roster, players, weather) : [],
  };

  if (kind === 'pre-game') {
    // Adapters leave Matchup.projectedPoints null — only the API ever sums it — so the
    // opponent's number gets built here from their roster the same way mine was.
    const weekMatchups = await adapter.getMatchups(league.externalLeagueId, league.currentWeek);
    const mine = weekMatchups.find((m) => m.externalTeamId === summary.teamId);
    const opponentId = mine?.opponentExternalTeamId ?? null;
    if (opponentId) {
      const opponentRoster = rosters.find((r) => r.externalTeamId === opponentId);
      entry.opponentProjectedPoints = opponentRoster
        ? sumStarterProjections(opponentRoster, players)
        : null;
      entry.opponentName = teams.find((t) => t.externalTeamId === opponentId)?.displayName ?? null;
    }
    return entry;
  }

  // Post-game. `currentWeek` is the week now in progress — the same assumption the win-rate
  // drawer makes — so the week just played is the one before it.
  const lastWeek = league.currentWeek - 1;
  if (lastWeek >= 1) {
    const lastWeekMatchups = await adapter.getMatchups(league.externalLeagueId, lastWeek);
    entry.lastWeekResult = matchupResult(lastWeekMatchups, summary.teamId);
  }
  return entry;
}

async function collectEntries(kind: DigestKind, useMock: boolean): Promise<LeagueDigestEntry[]> {
  const [sleeperResult, espnResult] = await Promise.allSettled([
    getSleeperLeagues(useMock),
    getEspnLeagues(useMock),
  ]);

  const entries: LeagueDigestEntry[] = [];
  for (const [platform, result] of [
    ['sleeper', sleeperResult],
    ['espn', espnResult],
  ] as const) {
    // One platform being down shouldn't cost you the other platform's email.
    if (result.status !== 'fulfilled') continue;
    const ownerExternalUserId = await resolveOwnerId(platform, useMock);
    const built = await Promise.all(
      result.value.map((league) => buildEntry(kind, platform, league, ownerExternalUserId, useMock)),
    );
    for (const entry of built) {
      if (entry) entries.push(entry);
    }
  }
  return entries;
}

export interface DigestSendResult {
  kind: DigestKind;
  messageId: string;
  leaguesChecked: number;
}

/** Build and send one digest. The HTTP route and the scheduled function share this path. */
export async function buildAndSendDigest(
  kind: DigestKind,
  useMock: boolean,
): Promise<DigestSendResult> {
  const entries = await collectEntries(kind, useMock);
  const { subject, body } = renderDigestEmail(kind, buildDigest(kind, entries));
  const { id } = await sendDigestEmail(subject, body);
  return { kind, messageId: id, leaguesChecked: entries.length };
}
