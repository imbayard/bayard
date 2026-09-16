/** ESPN position and lineup slot ID mappings. */

/**
 * ESPN lineup slot ids. These are ESPN's own numbering — not the player `defaultPositionId`
 * table below, and not Sleeper's slot names. 20 is the bench and 21 is IR; `mapRoster` keys
 * off the 'BN'/'IR' labels, so getting those two wrong turns a bench into a lineup.
 * Composite slots keep ESPN's spelling and get their eligibility from `types/roster-slots.ts`.
 */
export const LINEUP_SLOT_MAP: Record<number, string> = {
  0: 'QB',
  1: 'TQB',
  2: 'RB',
  3: 'RB/WR',
  4: 'WR',
  5: 'WR/TE',
  6: 'TE',
  7: 'OP',
  8: 'DT',
  9: 'DE',
  10: 'LB',
  11: 'DL',
  12: 'CB',
  13: 'S',
  14: 'DB',
  15: 'DP',
  16: 'DEF',
  17: 'K',
  18: 'P',
  19: 'HC',
  20: 'BN',
  21: 'IR',
  23: 'FLEX',
  24: 'EDR',
};

/**
 * Player `defaultPositionId` (NOT lineup slot id) to position abbreviation.
 * 1 QB, 2 RB, 3 WR, 4 TE, 5 K, 16 D/ST are the standard fantasy positions; the rest are IDP.
 */
export const POSITION_BY_ID: Record<number, string> = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  7: 'P',
  9: 'DT',
  10: 'DE',
  11: 'LB',
  12: 'CB',
  13: 'S',
  16: 'DEF',
};

/** Injury status normalization from ESPN codes/strings */
export const INJURY_STATUS_MAP: Record<string, string | null> = {
  active: null,
  out: 'Out',
  doubtful: 'Doubtful',
  questionable: 'Questionable',
  day_to_day: 'Day to Day',
  out_indefinitely: 'Out Indefinitely',
  suspend: 'Suspended',
  suspension: 'Suspended',
  ir: 'IR',
  pup: 'PUP',
};

/** NFL team abbreviations for player pool. ESPN uses team IDs; we convert to abbrevs. */
export const NFL_TEAM_BY_ID: Record<number, string> = {
  1: 'ATL',
  2: 'BUF',
  3: 'CHI',
  4: 'CIN',
  5: 'CLE',
  6: 'DAL',
  7: 'DEN',
  8: 'DET',
  9: 'GB',
  10: 'TEN',
  11: 'IND',
  12: 'KC',
  13: 'LAC',
  14: 'LAR',
  15: 'MIA',
  16: 'MIN',
  17: 'NE',
  18: 'NO',
  19: 'NYG',
  20: 'NYJ',
  21: 'PHI',
  22: 'ARI',
  23: 'PIT',
  24: 'SF',
  25: 'SEA',
  26: 'TB',
  27: 'WSH',
  28: 'CAR',
  29: 'JAX',
  30: 'LV',
  33: 'BAL',
  34: 'HOU',
};
