import { normalizeTeamCode } from '../adapters/nflverse/team-codes.js';
import type { NflGameState, Platform, Player } from '../types/league.js';

/** Whose lineup a starter is in: mine (root for) or my opponent's (root against). */
export type RootingSide = 'for' | 'against';

/** One player starting in one lineup this week — the unit the board is summed from. */
export interface RootingStarter {
  leagueName: string;
  platform: Platform;
  side: RootingSide;
  player: Player;
  projectedPoints: number | null;
  actualPoints: number | null;
}

export type RootingStake = Omit<RootingStarter, 'player'>;

export interface RootingRow {
  key: string;
  fullName: string;
  position: string;
  nflTeam: string | null;
  /** Net direction across every league: what's left after owning and facing cancel out. */
  side: RootingSide;
  /** Net points in the row's direction — how much this player's week is worth to me. */
  projectedPoints: number;
  actualPoints: number;
  /** This week's NFL game; null on bye, for free agents, or when the slate is unavailable. */
  game: NflGameState | null;
  stakes: RootingStake[];
}

const NAME_SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b/g;

/**
 * Player ids are platform-scoped, so the same human needs a cross-platform key. Defenses are
 * named differently everywhere ("Jets D/ST" vs "New York Jets"), so they key on team instead.
 */
export function rootingKey(player: Player): string {
  if (player.position === 'DEF' && player.nflTeam) {
    return `DEF:${normalizeTeamCode(player.nflTeam)}`;
  }
  const name = player.fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(NAME_SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${player.position}:${name}`;
}

/**
 * Nets every starter across leagues into one row per player: mine count up, my opponents' count
 * down. The side follows the net projection, falling back to the net lineup count when
 * projections are missing; a player who fully cancels out drops off the board.
 */
export function buildRootingBoard(
  starters: RootingStarter[],
  gameStates: Map<string, NflGameState> = new Map(),
): RootingRow[] {
  const groups = new Map<string, RootingStarter[]>();
  for (const s of starters) {
    const key = rootingKey(s.player);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }

  const rows: RootingRow[] = [];
  for (const [key, group] of groups) {
    let projected = 0;
    let actual = 0;
    let count = 0;
    for (const s of group) {
      const sign = s.side === 'for' ? 1 : -1;
      projected += sign * (s.projectedPoints ?? 0);
      actual += sign * (s.actualPoints ?? 0);
      count += sign;
    }

    const direction = Math.sign(projected) || Math.sign(count);
    if (direction === 0) continue;

    const { player } = group[0]!;
    rows.push({
      key,
      fullName: player.fullName,
      position: player.position,
      nflTeam: player.nflTeam,
      side: direction > 0 ? 'for' : 'against',
      projectedPoints: round2(direction * projected),
      actualPoints: round2(direction * actual),
      game: player.nflTeam ? (gameStates.get(normalizeTeamCode(player.nflTeam)) ?? null) : null,
      stakes: group.map(({ player: _player, ...stake }) => stake),
    });
  }

  return rows.sort((a, b) => b.projectedPoints - a.projectedPoints);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100 + 0;
}
