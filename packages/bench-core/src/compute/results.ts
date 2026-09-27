import type { Matchup } from '../types/league.js';

export type MatchupResult = 'win' | 'loss' | 'tie';

/**
 * How one team's week turned out, from that week's matchup rows. Null when the week can't
 * be judged — the team is on bye, isn't in the set, or its opponent's row is missing — so
 * callers can skip it rather than count a phantom loss.
 */
export function matchupResult(matchups: Matchup[], teamId: string): MatchupResult | null {
  const mine = matchups.find((m) => m.externalTeamId === teamId);
  if (!mine || mine.opponentExternalTeamId == null) return null;
  const opponent = matchups.find((m) => m.externalTeamId === mine.opponentExternalTeamId);
  if (!opponent) return null;

  if (mine.points > opponent.points) return 'win';
  if (mine.points < opponent.points) return 'loss';
  return 'tie';
}

export interface WinLossRecord {
  wins: number;
  losses: number;
  ties: number;
}

export function tallyResults(results: (MatchupResult | null)[]): WinLossRecord {
  const record = { wins: 0, losses: 0, ties: 0 };
  for (const result of results) {
    if (result === 'win') record.wins += 1;
    else if (result === 'loss') record.losses += 1;
    else if (result === 'tie') record.ties += 1;
  }
  return record;
}

/** "3-1" / "3-1-1" — the trailing tie count only when there is one. */
export function formatRecord(record: WinLossRecord): string {
  const base = `${record.wins}-${record.losses}`;
  return record.ties > 0 ? `${base}-${record.ties}` : base;
}
