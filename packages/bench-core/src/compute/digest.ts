import type { League } from '../types/league.js';
import { compareFlagTypes } from './flags/severity.js';
import type { InjuryEntry } from './injury.js';
import { formatRecord, tallyResults, type MatchupResult } from './results.js';
import type { BenchIqFlag, BenchIqTrend } from './types.js';
import type { WeatherExposure } from './weather.js';

export type DigestKind = 'pre-game' | 'post-game';

/** Everything one league contributes to a digest. Fields a given kind doesn't need stay empty. */
export interface LeagueDigestEntry {
  league: League;
  flags: BenchIqFlag[];
  /** Usage moves, strongest first. Kept apart from flags: context, not a call to action. */
  trends: BenchIqTrend[];
  injuries: InjuryEntry[];
  projectedPoints: number | null;
  opponentProjectedPoints: number | null;
  opponentName: string | null;
  /** Result of the week just played; null when it can't be judged (bye, missing rows). */
  lastWeekResult: MatchupResult | null;
  /** Starters whose game has notable-or-worse weather for their position. */
  weather: WeatherExposure[];
}

export interface DigestSection {
  title: string;
  lines: string[];
}

function points(value: number | null): string {
  return value === null ? '—' : value.toFixed(1);
}

/** Where each league stands before kickoff: my projection against my opponent's. */
export function buildProjectionsSection(entries: LeagueDigestEntry[]): DigestSection {
  const lines = entries.map((e) => {
    const mine = points(e.projectedPoints);
    if (e.opponentProjectedPoints === null) {
      return `${e.league.name} — ${mine} projected`;
    }
    const theirs = points(e.opponentProjectedPoints);
    const head = `${e.league.name} — ${mine} vs ${theirs} ${e.opponentName ?? 'opponent'}`;
    // No projection of my own means no margin. Treating null as zero would report a
    // confident double-digit deficit built entirely out of missing data.
    if (e.projectedPoints === null) return head;
    const margin = e.projectedPoints - e.opponentProjectedPoints;
    return `${head} (${margin >= 0 ? '+' : ''}${margin.toFixed(1)})`;
  });

  return { title: 'Projections', lines: lines.length > 0 ? lines : ['No leagues found.'] };
}

/**
 * One line per league that has flags, plus a trailing "N clean" line when some don't —
 * matches the Attention Queue's rule that "all clean" is a first-class state, not silence.
 */
export function buildFlagsDigestSection(entries: LeagueDigestEntry[]): DigestSection {
  const flagged = entries.filter((e) => e.flags.length > 0);
  const cleanCount = entries.length - flagged.length;

  const lines: string[] = [];
  for (const { league, flags } of flagged) {
    const critical = flags.filter((f) => f.level === 'critical').length;
    const warning = flags.filter((f) => f.level === 'warning').length;
    const counts = [
      critical > 0 ? `${critical} critical` : null,
      warning > 0 ? `${warning} warning${warning === 1 ? '' : 's'}` : null,
    ].filter((p): p is string => p !== null);
    lines.push(`${league.name} — ${counts.join(', ')}`);
    // Same urgency order the attention queue uses, so the email reads like the deck.
    for (const flag of [...flags].sort((a, b) => compareFlagTypes(a.type, b.type))) {
      lines.push(`    ${flag.message}`);
    }
  }

  if (cleanCount > 0) {
    lines.push(
      flagged.length === 0
        ? 'All leagues clean.'
        : `${cleanCount} other league${cleanCount === 1 ? '' : 's'} clean.`,
    );
  }

  return { title: 'Flags', lines };
}

/**
 * Only the big usage moves get a line; the rest are a count, with the detail one click away
 * on the deck. A heads-up section, so it stays quiet when nothing has moved.
 */
export function buildTrendsSection(entries: LeagueDigestEntry[]): DigestSection | null {
  // One line per player: a player rostered in three leagues is one move, not three.
  const byPlayer = new Map<string, { leagues: string[]; trend: BenchIqTrend }>();
  for (const { league, trends } of entries) {
    for (const trend of trends) {
      const seen = byPlayer.get(trend.playerId);
      if (seen) seen.leagues.push(league.name);
      else byPlayer.set(trend.playerId, { leagues: [league.name], trend });
    }
  }
  const all = [...byPlayer.values()];
  if (all.length === 0) return null;
  const major = all.filter((e) => e.trend.major).sort((a, b) => b.trend.strength - a.trend.strength);
  const others = all.length - major.length;
  const plural = others === 1 ? 'trend' : 'trends';

  const lines = major.map(({ leagues, trend }) => `${leagues.join(', ')} — ${trend.message}`);
  if (others > 0) {
    lines.push(major.length > 0 ? `And ${others} other ${plural}.` : `${others} smaller ${plural} — see the deck.`);
  }
  return { title: 'Trends', lines };
}

/** Questionable/Doubtful/Out across every roster — starters first, worst first. */
export function buildInjurySection(entries: LeagueDigestEntry[]): DigestSection {
  const lines: string[] = [];
  for (const { league, injuries } of entries) {
    if (injuries.length === 0) continue;
    lines.push(`${league.name}`);
    for (const injury of injuries) {
      const where = injury.starting ? 'starting' : 'bench';
      const position = injury.position ? ` ${injury.position}` : '';
      lines.push(`    ${injury.status} —${position} ${injury.playerName} (${where})`);
    }
  }

  return { title: 'Injury report', lines: lines.length > 0 ? lines : ['No injuries reported.'] };
}

/**
 * Starters playing in weather that touches their position, one line per game per league —
 * harsh and notable alike, since this is the read before lineups lock. Harsh games lead.
 */
export function buildWeatherSection(entries: LeagueDigestEntry[]): DigestSection {
  const lines: string[] = [];
  for (const { league, weather } of entries) {
    if (weather.length === 0) continue;
    const byGame = new Map<string, WeatherExposure[]>();
    for (const exposure of weather) {
      const key = `${exposure.weather.away}@${exposure.weather.home}`;
      byGame.set(key, [...(byGame.get(key) ?? []), exposure]);
    }
    const games = [...byGame.values()].sort(
      (a, b) => Number(b.some((e) => e.severity === 'harsh')) - Number(a.some((e) => e.severity === 'harsh')),
    );
    lines.push(`${league.name}`);
    for (const exposures of games) {
      const game = exposures[0]!.weather;
      const conditions = game.notes.map((n) => n.label).join(', ');
      const who = exposures.map((e) => `${e.playerName} (${e.position})`).join(', ');
      lines.push(`    ${game.away} @ ${game.home} — ${conditions}: ${who}`);
    }
  }

  return {
    title: 'Weather',
    lines: lines.length > 0 ? lines : ['No weather worth noting for your starters.'],
  };
}

/** How the week just played went, across the whole portfolio. */
export function buildRecordSection(entries: LeagueDigestEntry[]): DigestSection {
  const judged = entries.filter((e) => e.lastWeekResult !== null);
  if (judged.length === 0) {
    return { title: 'Last week', lines: ['No completed matchups to report.'] };
  }

  const record = tallyResults(judged.map((e) => e.lastWeekResult));
  const lines = [`Overall: ${formatRecord(record)}`];
  for (const entry of judged) {
    const verdict = entry.lastWeekResult === 'win' ? 'W' : entry.lastWeekResult === 'loss' ? 'L' : 'T';
    lines.push(`    ${verdict}  ${entry.league.name}`);
  }
  return { title: 'Last week', lines };
}

/**
 * Waiver-wire upgrades only — the flags that cost a roster move, which is exactly the
 * decision Tuesday is for. Bench swaps are a pre-game concern and stay out of this one.
 */
export function buildWaiverSection(entries: LeagueDigestEntry[]): DigestSection {
  const lines: string[] = [];
  for (const { league, flags } of entries) {
    const waivers = flags
      .filter((f) => f.type === 'WAIVER_PLAYER_HIGHER_PROJECTION')
      .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0));
    if (waivers.length === 0) continue;
    lines.push(`${league.name}`);
    for (const flag of waivers) {
      const delta = flag.delta === null ? '' : ` (+${flag.delta.toFixed(1)})`;
      lines.push(`    ${flag.playerName} over ${flag.starterName ?? 'your starter'}${delta}`);
    }
  }

  return {
    title: 'Waiver targets',
    lines: lines.length > 0 ? lines : ['Nothing on the wire clears the threshold.'],
  };
}

const SUBJECTS: Record<DigestKind, string> = {
  'pre-game': 'Heads up — games starting',
  'post-game': 'Week review',
};

export function buildDigest(kind: DigestKind, entries: LeagueDigestEntry[]): DigestSection[] {
  return kind === 'pre-game'
    ? [
        buildProjectionsSection(entries),
        buildFlagsDigestSection(entries),
        buildInjurySection(entries),
        buildWeatherSection(entries),
        buildTrendsSection(entries),
      ].filter((s): s is DigestSection => s !== null)
    : [buildRecordSection(entries), buildWaiverSection(entries)];
}

/**
 * Sections in, plain-text email out. `app: 'bench'` already gets the subject prefixed with
 * "[bench]" by the shared email sender, so the subject here stays bare.
 */
export function renderDigestEmail(
  kind: DigestKind,
  sections: DigestSection[],
): { subject: string; body: string } {
  const body = sections
    .map((s) => `${s.title}\n${'-'.repeat(s.title.length)}\n${s.lines.join('\n')}`)
    .join('\n\n');
  return { subject: SUBJECTS[kind], body };
}
