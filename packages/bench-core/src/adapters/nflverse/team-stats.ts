import type { TeamGiveawayAggregate } from '../../types/nflverse.js';
import { numberOr0, parseCsvRecords, parseNumeric } from './csv.js';
import { normalizeTeamCode } from './team-codes.js';
import type { RawTeamWeekRow } from './types.js';

/** Parses the nflverse team weekly stats CSV into header-keyed rows. */
export function parseTeamWeekCsv(text: string): RawTeamWeekRow[] {
  return parseCsvRecords<RawTeamWeekRow>(text);
}

/**
 * Points this team's offense scored. Touchdowns come from passing + rushing only:
 * `receiving_tds` counts the same plays as `passing_tds`, and defensive/special-teams
 * scores aren't the offense's doing, which is the whole point of the measure.
 */
function offensePoints(row: RawTeamWeekRow): number {
  const touchdowns = numberOr0(row.passing_tds) + numberOr0(row.rushing_tds);
  const twoPointers =
    numberOr0(row.passing_2pt_conversions) + numberOr0(row.rushing_2pt_conversions);
  return 6 * touchdowns + 3 * numberOr0(row.fg_made) + numberOr0(row.pat_made) + 2 * twoPointers;
}

export interface GiveawayOptions {
  /**
   * Ignore games after this week. The scout asks "what do we know as of week N", and a
   * frame that reaches into the future must not be scored on games inside it — omitting
   * this on a completed season is fine, since there is nothing later to exclude.
   */
  throughWeek?: number;
}

/**
 * Aggregates team-week stat rows into per-offense season-to-date giveaway counts.
 * Pure — no I/O — so it is unit-testable without touching the network.
 * Regular season only; output is sorted by normalized team code for determinism.
 */
export function aggregateGiveaway(
  rows: RawTeamWeekRow[],
  options: GiveawayOptions = {},
): TeamGiveawayAggregate[] {
  const byTeam = new Map<string, TeamGiveawayAggregate>();

  const bucket = (team: string): TeamGiveawayAggregate => {
    let agg = byTeam.get(team);
    if (!agg) {
      agg = {
        team,
        games: 0,
        dropbacks: 0,
        plays: 0,
        sacksAllowed: 0,
        interceptions: 0,
        fumblesLost: 0,
        points: 0,
      };
      byTeam.set(team, agg);
    }
    return agg;
  };

  for (const row of rows) {
    const rawTeam = row.team;
    if (!rawTeam || rawTeam === 'NA') continue;
    // Preseason and playoff rows would both distort a regular-season rate.
    if (row.season_type !== undefined && row.season_type !== '' && row.season_type !== 'REG') {
      continue;
    }
    const week = parseNumeric(row.week);
    if (week === undefined) continue;
    if (options.throughWeek !== undefined && week > options.throughWeek) continue;

    const agg = bucket(normalizeTeamCode(rawTeam));
    const attempts = numberOr0(row.attempts);
    const sacks = numberOr0(row.sacks_suffered);

    agg.games++;
    agg.dropbacks += attempts + sacks;
    agg.plays += attempts + numberOr0(row.carries) + sacks;
    agg.sacksAllowed += sacks;
    agg.interceptions += numberOr0(row.passing_interceptions);
    agg.fumblesLost += numberOr0(row.fumbles_lost_total);
    agg.points += offensePoints(row);
  }

  return [...byTeam.values()].sort((a, b) => a.team.localeCompare(b.team));
}

/**
 * Blends a prior season into the current one so that `priorWeight` is what it says it is:
 * the share of the answer that comes from last year. Every facet downstream is a *rate*
 * (sacks per dropback, points per game), so the prior season is first scaled down to the
 * current season's sample size — otherwise a 17-game prior against a 1-game current would
 * drown it out and a "0.6" weight would really mean 0.9.
 *
 * The scale comes from league-wide game totals rather than per-team ones, so a team on bye
 * in the current sample keeps last year's rates instead of being re-weighted against itself.
 * Counts are weighted, not games: a team present in only one of the two seasons keeps
 * whatever data it has rather than being dropped.
 */
export function blendGiveaway(
  current: TeamGiveawayAggregate[],
  prior: TeamGiveawayAggregate[],
  priorWeight: number,
): TeamGiveawayAggregate[] {
  if (priorWeight <= 0 || prior.length === 0) return current;
  if (priorWeight >= 1 || current.length === 0) return prior;

  const totalGames = (aggregates: TeamGiveawayAggregate[]): number =>
    aggregates.reduce((sum, a) => sum + a.games, 0);
  const currentGames = totalGames(current);
  const priorGames = totalGames(prior);
  // Nothing to blend against — whichever side has games is the whole answer.
  if (currentGames === 0) return prior;
  if (priorGames === 0) return current;

  // Give the prior season an effective sample of currentGames * w/(1-w), which makes the
  // blended rate exactly (1 - w) * currentRate + w * priorRate.
  const scale = (priorWeight / (1 - priorWeight)) * (currentGames / priorGames);
  const byTeam = new Map<string, TeamGiveawayAggregate>();

  const add = (agg: TeamGiveawayAggregate, weight: number): void => {
    const into = byTeam.get(agg.team) ?? {
      team: agg.team,
      games: 0,
      dropbacks: 0,
      plays: 0,
      sacksAllowed: 0,
      interceptions: 0,
      fumblesLost: 0,
      points: 0,
    };
    into.games += agg.games * weight;
    into.dropbacks += agg.dropbacks * weight;
    into.plays += agg.plays * weight;
    into.sacksAllowed += agg.sacksAllowed * weight;
    into.interceptions += agg.interceptions * weight;
    into.fumblesLost += agg.fumblesLost * weight;
    into.points += agg.points * weight;
    byTeam.set(agg.team, into);
  };

  for (const agg of current) add(agg, 1);
  for (const agg of prior) add(agg, scale);

  return [...byTeam.values()].sort((a, b) => a.team.localeCompare(b.team));
}
