import type { MarketValue } from '../../adapters/fantasycalc/client.js';
import type { MetricCalibration } from '../../types/analytics.js';
import type { League, Player, Roster, Team } from '../../types/league.js';
import type { SeasonProduction } from '../../types/platform.js';
import { formatRecord } from '../results.js';
import { optimalLineup, type LineupPlayer } from './lineup.js';
import { ageMultiplier, FALLBACK_CALIBRATION, shrinkPpg, TRADE_POSITIONS } from './values.js';

export type TradeMode = 'buyer' | 'seller';

/** Within this share of the bigger side's value, a deal is fair. */
const FAIRNESS = 0.15;
/** A second player adds this much of his value: one stud beats two halves of one. */
const SECOND_PIECE = 0.75;
/** Below this (ppg, or ppg-over-replacement) a gain is noise. */
const MIN_GAIN = 0.3;
/** How much the partner's lineup gain counts toward a package's rank, beside yours. */
const PARTNER_WEIGHT = 0.5;
const MAX_PARTNERS = 3;
const MAX_PER_PARTNER = 3;
/** The same target can headline at most this many packages, so one star doesn't fill the page. */
const MAX_PER_TARGET = 2;
/** A position whose starters trail the league's by this share is a need. */
const NEED_GAP = 0.1;
/** A player the market ranks this many percentiles above our value is a sell-high. */
const SELL_HIGH_GAP = 0.2;

export interface TradeAsset {
  externalPlayerId: string;
  name: string;
  position: string;
  nflTeam: string | null;
  age: number | null;
  /** Season-to-date PPG under the league's scoring; null before he's played. */
  ppg: number | null;
  games: number;
  /** FantasyCalc value; null when the market has no price for him or is unavailable. */
  market: number | null;
  /** Our value: shrunk PPG over the position's replacement level, age-weighted in dynasty. */
  ours: number;
}

export interface SideDelta {
  /** Change in the optimal starting lineup's season PPG. */
  lineup: number;
  /** Season PPG in minus season PPG out, starters or not. */
  raw: number;
}

export interface TradePackage {
  give: TradeAsset[];
  get: TradeAsset[];
  you: SideDelta;
  them: SideDelta;
  fairness: { basis: 'market' | 'ours'; give: number; get: number; /** (get − give) / larger side */ diff: number };
  reason: string;
  score: number;
}

export interface TradePartner {
  externalTeamId: string;
  displayName: string;
  record: string;
  standing: number;
  needs: string[];
  surplus: Array<{ position: string; count: number }>;
  packages: TradePackage[];
}

export interface TradeRadarResult {
  mode: TradeMode;
  suggestedMode: TradeMode;
  /** e.g. "6-2, 2nd → buyer" */
  suggestionReason: string;
  /** What fairness was judged on: market values, ours by choice, or ours because the market was down. */
  market: 'on' | 'off' | 'unavailable';
  /** Weeks 1–2: season PPG is mostly last season's prior. */
  earlySeason: boolean;
  myNeeds: string[];
  partners: TradePartner[];
  /** Set when no package qualified: why. */
  emptyReason: string | null;
}

export interface TradeRadarInput {
  league: League;
  teams: Team[];
  rosters: Roster[];
  players: Map<string, Player>;
  myTeamId: string;
  production: Map<string, SeasonProduction>;
  calibration: MetricCalibration | null;
  /** FantasyCalc values keyed by platform ID; null when the market couldn't be reached. */
  market: Map<string, MarketValue> | null;
  /** The market toggle. Ignored (off) when `market` is null. */
  useMarket: boolean;
  /** Omitted → the suggested mode. */
  mode?: TradeMode;
}

interface Valued extends TradeAsset {
  shrunk: number;
}

interface TeamView {
  team: Team;
  standing: number;
  roster: Valued[];
  lineup: number;
  rawLineup: number;
  needs: string[];
  surplus: Array<{ position: string; count: number }>;
}

/**
 * Trade Radar: concrete packages between my team and every other, for a buyer or a seller.
 *
 * Two values per player, each with one job. Fairness — would they take it? — is judged on
 * market value (FantasyCalc), or on ours when the market is muted or down. Whether *I* want
 * it is always ours: shrunk league-scored PPG over the waiver wire's best at the position.
 * A package qualifies only when it's fair, the partner's lineup doesn't get worse, and I gain:
 * buyers by starting-lineup PPG, sellers by our value (age-weighted again in dynasty, so
 * youth wins). Kickers, defenses and IDP are never traded.
 */
export function tradeRadar(input: TradeRadarInput): TradeRadarResult {
  const { league, teams, rosters, players, myTeamId, production } = input;
  const dynasty = league.leagueType === 'dynasty';
  const marketState = input.market === null ? 'unavailable' : input.useMarket ? 'on' : 'off';
  const market = input.market ?? new Map<string, MarketValue>();

  const tradable = (id: string) => TRADE_POSITIONS.includes(players.get(id)?.position ?? '');
  const rostered = new Set(rosters.flatMap((r) => r.entries.map((e) => e.externalPlayerId)));
  const shrunk = shrinkPpg(
    production,
    (id) => players.get(id)?.position,
    [...new Set([...rostered, ...production.keys()])].filter(tradable),
    input.calibration ?? FALLBACK_CALIBRATION,
  );

  // Replacement level: the best player nobody rosters, by the same shrunk PPG.
  const replacement: Record<string, number> = {};
  for (const [id, value] of shrunk) {
    const position = players.get(id)!.position;
    if (!rostered.has(id)) replacement[position] = Math.max(replacement[position] ?? 0, value);
  }

  const valued = (id: string): Valued | null => {
    const player = players.get(id);
    if (!player || !tradable(id)) return null;
    const p = production.get(id);
    const m = market.get(id);
    const age = m?.age ?? null;
    const s = shrunk.get(id) ?? 0;
    const overReplacement = Math.max(0, s - (replacement[player.position] ?? 0));
    return {
      externalPlayerId: id,
      name: player.fullName,
      position: player.position,
      nflTeam: player.nflTeam,
      age,
      ppg: p?.ppg ?? null,
      games: p?.games ?? 0,
      market: m?.value ?? null,
      ours: round1(overReplacement * (dynasty ? ageMultiplier(player.position, age) : 1)),
      shrunk: s,
    };
  };

  const standings = rankTeams(teams);
  const views: TeamView[] = rosters.flatMap((r) => {
    const team = teams.find((t) => t.externalTeamId === r.externalTeamId);
    if (!team) return [];
    const roster = r.entries.map((e) => valued(e.externalPlayerId)).filter((v): v is Valued => v !== null);
    return [
      {
        team,
        standing: standings.indexOf(team) + 1,
        roster,
        lineup: lineupOf(league, roster, 'shrunk'),
        rawLineup: lineupOf(league, roster, 'ppg'),
        needs: [],
        surplus: [],
      },
    ];
  });
  annotateNeeds(league, views);

  const me = views.find((v) => v.team.externalTeamId === myTeamId);
  if (!me) throw new Error(`Team "${myTeamId}" has no roster in this league.`);

  const { mode: suggestedMode, reason: suggestionReason } = suggestMode(league, views, me, standings);
  const mode = input.mode ?? suggestedMode;
  const basis = marketState === 'on' ? 'market' : 'ours';
  const fairValue = (a: Valued) => (basis === 'market' ? (a.market ?? 0) : a.ours);
  // Dynasty sellers weigh age twice: once in our value, once more here, so youth wins.
  const keepValue = (a: Valued) => (dynasty ? a.ours * ageMultiplier(a.position, a.age) : a.ours);

  const marketGap = percentileGap(views.flatMap((v) => v.roster));

  const counts = { fair: 0, partnerOk: 0 };
  const all: Array<TradePackage & { partner: TeamView }> = [];

  for (const partner of views) {
    if (partner === me) continue;
    for (const [give, get] of shapes(me.roster, partner.roster)) {
      const fairness = judgeFairness(give.map(fairValue), get.map(fairValue));
      if (!fairness) continue;
      counts.fair += 1;

      const myAfter = swap(me.roster, give, get);
      const theirAfter = swap(partner.roster, get, give);
      // No worse on either read: the forward one (shrunk) and the season PPG the card shows.
      const theirLineup = lineupOf(league, theirAfter, 'shrunk') - partner.lineup;
      const theirRawLineup = lineupOf(league, theirAfter, 'ppg') - partner.rawLineup;
      if (theirLineup < -0.05 || theirRawLineup < -0.05) continue;
      counts.partnerOk += 1;

      const gain =
        mode === 'buyer'
          ? lineupOf(league, myAfter, 'shrunk') - me.lineup
          : sum(get.map(keepValue)) - sum(give.map(keepValue));
      if (gain < MIN_GAIN) continue;

      all.push({
        partner,
        give: give.map(strip),
        get: get.map(strip),
        you: {
          lineup: round1(lineupOf(league, myAfter, 'ppg') - me.rawLineup),
          raw: round1(sum(get.map(ppgOf)) - sum(give.map(ppgOf))),
        },
        them: {
          lineup: round1(theirRawLineup),
          raw: round1(sum(give.map(ppgOf)) - sum(get.map(ppgOf))),
        },
        fairness: { basis, ...fairness },
        reason: reasonFor({
          mode, dynasty, basis, give, get, me, partner, marketGap,
          myStarters: optimalLineup(league.rosterSlots, myAfter.map((x) => lineupPlayer(x, 'shrunk'))).starters,
        }),
        score: gain + PARTNER_WEIGHT * Math.max(0, theirLineup),
      });
    }
  }

  const partners = pickPackages(all);
  return {
    mode,
    suggestedMode,
    suggestionReason,
    market: marketState,
    earlySeason: league.currentWeek <= 2,
    myNeeds: me.needs,
    partners,
    emptyReason: partners.length > 0 ? null : emptyReason(mode, basis, counts),
  };
}

// ── Package search ───────────────────────────────────────────────────────────────────────────

/** 1-for-1, 2-for-1 and 1-for-2 — every way to pair my players with theirs, two a side at most. */
function* shapes(mine: Valued[], theirs: Valued[]): Generator<[Valued[], Valued[]]> {
  const ones = (xs: Valued[]) => xs.map((x) => [x]);
  const twos = (xs: Valued[]) => xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b]));
  for (const give of ones(mine)) for (const get of [...ones(theirs), ...twos(theirs)]) yield [give, get];
  for (const give of twos(mine)) for (const get of ones(theirs)) yield [give, get];
}

/** Two-piece sides count the lesser piece at SECOND_PIECE: consolidating into a stud costs extra. */
function sideValue(values: number[]): number {
  const [a = 0, b = 0] = [...values].sort((x, y) => y - x);
  return a + SECOND_PIECE * b;
}

function judgeFairness(giveValues: number[], getValues: number[]) {
  const give = sideValue(giveValues);
  const get = sideValue(getValues);
  const larger = Math.max(give, get);
  if (larger <= 0) return null;
  const diff = (get - give) / larger;
  return Math.abs(diff) <= FAIRNESS ? { give: Math.round(give * 10) / 10, get: Math.round(get * 10) / 10, diff: Math.round(diff * 100) / 100 } : null;
}

/**
 * Best packages first (fewer pieces on a tie); at most MAX_PER_TARGET per target player and
 * MAX_PER_PARTNER per partner. A deal that's a picked one plus a throw-in is skipped.
 */
function pickPackages(all: Array<TradePackage & { partner: TeamView }>): TradePartner[] {
  const pieces = (p: TradePackage) => p.give.length + p.get.length;
  all.sort((a, b) => b.score - a.score || pieces(a) - pieces(b));
  const ids = (xs: TradeAsset[]) => xs.map((a) => a.externalPlayerId);
  const within = (small: TradeAsset[], big: TradeAsset[]) => ids(small).every((id) => ids(big).includes(id));
  const perTarget = new Map<string, number>();
  const byPartner = new Map<TeamView, TradePackage[]>();
  for (const { partner, ...pkg } of all) {
    const targets = ids(pkg.get);
    if (targets.some((id) => (perTarget.get(id) ?? 0) >= MAX_PER_TARGET)) continue;
    const list = byPartner.get(partner) ?? [];
    if (list.some((p) => within(p.give, pkg.give) && within(p.get, pkg.get))) continue;
    if (list.length >= MAX_PER_PARTNER) continue;
    if (!byPartner.has(partner) && byPartner.size >= MAX_PARTNERS) continue;
    list.push({ ...pkg, score: round1(pkg.score) });
    byPartner.set(partner, list);
    for (const id of targets) perTarget.set(id, (perTarget.get(id) ?? 0) + 1);
  }
  return [...byPartner].map(([v, packages]) => ({
    externalTeamId: v.team.externalTeamId,
    displayName: v.team.displayName,
    record: formatRecord(v.team),
    standing: v.standing,
    needs: v.needs,
    surplus: v.surplus,
    packages,
  }));
}

function emptyReason(mode: TradeMode, basis: 'market' | 'ours', counts: { fair: number; partnerOk: number }): string {
  const other = mode === 'buyer' ? 'seller' : 'buyer';
  if (counts.fair === 0) return `No deal comes within ${FAIRNESS * 100}% on ${basis === 'market' ? 'market' : 'our'} value. Try ${other} mode.`;
  if (counts.partnerOk === 0) return `Every fair deal would weaken the other team's lineup, so none would be accepted. Try ${other} mode.`;
  return mode === 'buyer'
    ? `No fair deal improves your starting lineup. Try seller mode.`
    : `No fair deal brings back more than it costs you. Try buyer mode.`;
}

// ── Team context ─────────────────────────────────────────────────────────────────────────────

/** Best record first (a tie counts half a win), points for breaking ties. */
function rankTeams(teams: Team[]): Team[] {
  const winPct = (t: Team) => (t.wins + t.ties / 2) / Math.max(1, t.wins + t.losses + t.ties);
  return [...teams].sort((a, b) => winPct(b) - winPct(a) || b.pointsFor - a.pointsFor);
}

/**
 * Buyer when in a playoff spot or within a game of one; otherwise seller. A dynasty team
 * that's losing but has a top-three roster by our value still buys. Playoff spots aren't on
 * the league model, so take the common setup: six for 12+ teams, four for 8+, else half.
 */
function suggestMode(league: League, views: TeamView[], me: TeamView, standings: Team[]): { mode: TradeMode; reason: string } {
  const spots = league.teamCount >= 12 ? 6 : league.teamCount >= 8 ? 4 : Math.max(1, Math.floor(league.teamCount / 2));
  const games = (t: Team) => t.wins + t.ties / 2;
  const cutoff = standings[spots - 1];
  const behind = cutoff ? games(cutoff) - games(me.team) : 0;
  const head = `${formatRecord(me.team)}, ${ordinal(me.standing)}`;

  if (me.standing <= spots) return { mode: 'buyer', reason: `${head} → buyer` };
  if (behind <= 1) return { mode: 'buyer', reason: `${head}, ${behind === 0 ? 'tied for' : 'a game off'} a playoff spot → buyer` };
  if (league.leagueType === 'dynasty') {
    const strength = [...views].sort((a, b) => sum(b.roster.map((x) => x.ours)) - sum(a.roster.map((x) => x.ours)));
    if (strength.indexOf(me) < 3) return { mode: 'buyer', reason: `${head}, but a top-3 roster → buyer` };
  }
  return { mode: 'seller', reason: `${head}, ${behind} games out → seller` };
}

/**
 * Needs: positions whose starters average more than NEED_GAP below the league's starters there.
 * Surplus: bench players good enough to start for the weakest lineup in the league at that position.
 */
function annotateNeeds(league: League, views: TeamView[]): void {
  const startersAt = (v: TeamView, position: string) => {
    const { starters } = optimalLineup(league.rosterSlots, v.roster.map((x) => lineupPlayer(x, 'shrunk')));
    return v.roster.filter((x) => starters.has(x.externalPlayerId) && x.position === position);
  };
  for (const position of TRADE_POSITIONS) {
    const perTeam = views.map((v) => startersAt(v, position));
    const avgs = perTeam.map((s) => (s.length ? sum(s.map((x) => x.shrunk)) / s.length : 0));
    const league_ = avgs.reduce((a, b) => a + b, 0) / Math.max(1, avgs.length);
    const floor = Math.min(...perTeam.flat().map((x) => x.shrunk), Infinity);
    views.forEach((v, i) => {
      if (league_ > 0 && avgs[i]! < league_ * (1 - NEED_GAP)) v.needs.push(position);
      const starting = new Set(perTeam[i]!.map((x) => x.externalPlayerId));
      const spare = v.roster.filter((x) => x.position === position && !starting.has(x.externalPlayerId) && x.shrunk >= floor);
      if (spare.length > 0 && Number.isFinite(floor)) v.surplus.push({ position, count: spare.length });
    });
  }
  // A starter at a flex slot can be a spare at his position on paper; keep needs and surplus apart.
  for (const v of views) v.surplus = v.surplus.filter((s) => !v.needs.includes(s.position));
}

// ── Reasons ──────────────────────────────────────────────────────────────────────────────────

function reasonFor(ctx: {
  mode: TradeMode;
  dynasty: boolean;
  basis: 'market' | 'ours';
  give: Valued[];
  get: Valued[];
  me: TeamView;
  partner: TeamView;
  marketGap: (a: Valued) => number;
  /** My starters after the trade. */
  myStarters: Set<string>;
}): string {
  const { mode, dynasty, basis, give, get, me, partner, marketGap, myStarters } = ctx;
  const parts: string[] = [];
  const getNeed = get.find((a) => me.needs.includes(a.position));
  const giveNeed = give.find((a) => partner.needs.includes(a.position));
  const fromSurplus = get.find((a) => partner.surplus.some((s) => s.position === a.position));

  if (give.length === 2 && get.length === 1) parts.push(`Consolidate two players into one ${get[0]!.position}`);
  if (give.length === 1 && get.length === 2) {
    const bothStart = get.every((a) => myStarters.has(a.externalPlayerId));
    parts.push(`Turn one ${give[0]!.position} into two ${bothStart ? 'starters' : 'players'}`);
  }
  if (getNeed) parts.push(`fills your ${getNeed.position} gap`);
  if (giveNeed) parts.push(`fills their ${giveNeed.position} gap`);
  else if (fromSurplus) parts.push(`draws on their ${fromSurplus.position} depth`);

  if (mode === 'seller' && basis === 'market') {
    const sellHigh = give.find((a) => marketGap(a) >= SELL_HIGH_GAP);
    if (sellHigh) parts.push(`sell ${sellHigh.name} while the market rates him above his production`);
  }
  if (dynasty && mode === 'seller') {
    const younger = avgAge(give) - avgAge(get);
    if (younger >= 2) parts.push(`get ${Math.round(younger)} years younger`);
  }

  if (parts.length === 0) parts.push(mode === 'buyer' ? 'Upgrades your starting lineup' : 'Brings back more value than it costs');
  const line = parts.slice(0, 2).join('; ');
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/**
 * Market percentile minus our-value percentile among rostered players. Positive means the
 * market likes him more than his production does — the gap a seller cashes in.
 */
function percentileGap(pool: Valued[]): (a: Valued) => number {
  const pct = (values: number[]) => (x: number) => values.filter((v) => v < x).length / Math.max(1, values.length);
  const marketPct = pct(pool.map((a) => a.market ?? 0));
  const oursPct = pct(pool.map((a) => a.ours));
  return (a) => (a.market === null ? 0 : marketPct(a.market) - oursPct(a.ours));
}

function avgAge(xs: Valued[]): number {
  const ages = xs.map((x) => x.age).filter((a): a is number => a !== null);
  return ages.length ? sum(ages) / ages.length : 0;
}

// ── Small helpers ────────────────────────────────────────────────────────────────────────────

function lineupPlayer(x: Valued, by: 'shrunk' | 'ppg'): LineupPlayer {
  return { id: x.externalPlayerId, position: x.position, ppg: by === 'shrunk' ? x.shrunk : (x.ppg ?? 0) };
}

function lineupOf(league: League, roster: Valued[], by: 'shrunk' | 'ppg'): number {
  return optimalLineup(league.rosterSlots, roster.map((x) => lineupPlayer(x, by))).points;
}

function swap(roster: Valued[], out: Valued[], incoming: Valued[]): Valued[] {
  return [...roster.filter((x) => !out.includes(x)), ...incoming];
}

function strip({ shrunk: _shrunk, ...asset }: Valued): TradeAsset {
  return asset;
}

const ppgOf = (x: Valued) => x.ppg ?? 0;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round1 = (x: number) => Math.round(x * 10) / 10;

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}
