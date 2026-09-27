import type { Player, Roster } from '../types/league.js';

/**
 * Statuses that mean a player cannot play. Starting one is a critical flag.
 *
 * Neither platform guarantees this vocabulary — Sleeper title-cases whatever its raw feed
 * sends and ESPN maps a known set, so an unrecognized spelling reads as "not inactive"
 * rather than throwing. That's the safe direction to fail: a missed flag, not a false one.
 */
export const INACTIVE_STATUSES = new Set(['Out', 'IR', 'Suspended']);

/**
 * Statuses worth putting in an injury report, most severe first. Broader than
 * {@link INACTIVE_STATUSES} — Questionable and Doubtful never flag a lineup as broken, but
 * they're exactly what you want to see the night before games.
 */
export const REPORTABLE_INJURY_STATUSES = [
  'Out',
  'IR',
  'Suspended',
  'Out Indefinitely',
  'PUP',
  'Doubtful',
  'Questionable',
  'Day to Day',
] as const;

const SEVERITY = new Map<string, number>(REPORTABLE_INJURY_STATUSES.map((status, i) => [status, i]));

/**
 * Markers that mean "fine, playing". Adapters are supposed to map these to null, but both
 * platforms can emit strings we've never seen — Sleeper title-cases whatever its feed sends
 * — so the report screens them out rather than trusting every upstream mapping forever.
 *
 * A denylist, not an allowlist: an injury designation we haven't enumerated should still
 * reach the report, since a missed injury costs more than an unfamiliar word in an email.
 */
const HEALTHY_STATUSES = new Set(['Active', 'Normal', 'Healthy', 'Probable']);

export interface InjuryEntry {
  playerName: string;
  position: string | null;
  status: string;
  /** True when this player is in the starting lineup — the ones that actually cost points. */
  starting: boolean;
}

/**
 * Every injured player on a roster, starters first and then by severity. A status this
 * doesn't recognize still gets reported (ranked last) rather than silently dropped — an
 * unfamiliar spelling from a platform feed is still news.
 */
export function injuryReport(roster: Roster, players: Map<string, Player>): InjuryEntry[] {
  const entries: InjuryEntry[] = [];
  for (const entry of roster.entries) {
    if (entry.slot === 'taxi') continue;
    const player = players.get(entry.externalPlayerId);
    if (!player?.injuryStatus || HEALTHY_STATUSES.has(player.injuryStatus)) continue;
    entries.push({
      playerName: player.fullName,
      position: player.position,
      status: player.injuryStatus,
      starting: entry.slot === 'starter',
    });
  }

  const rank = (status: string) => SEVERITY.get(status) ?? REPORTABLE_INJURY_STATUSES.length;
  return entries.sort((a, b) => {
    if (a.starting !== b.starting) return a.starting ? -1 : 1;
    return rank(a.status) - rank(b.status);
  });
}
