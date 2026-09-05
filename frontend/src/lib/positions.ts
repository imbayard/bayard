/**
 * One color per fantasy position, resolved from the `--pos-*` tokens in `index.css`.
 * Returns CSS variable references rather than literal colors, so a position keeps the
 * same hue on every page and retheming is a one-line change in the stylesheet.
 */

const POSITION_TOKENS: Record<string, string> = {
  QB: '--pos-qb',
  RB: '--pos-rb',
  WR: '--pos-wr',
  TE: '--pos-te',
  K: '--pos-k',
  DEF: '--pos-def',
};

/** Platform-specific spellings that mean one of the six colored positions. */
const POSITION_ALIASES: Record<string, string> = {
  FB: 'RB',
  PK: 'K',
  DST: 'DEF',
  'D/ST': 'DEF',
  DL: 'DEF',
  LB: 'DEF',
  DB: 'DEF',
};

/** Normalizes casing and platform spellings; unknown positions (FLEX, BN, UNK) stay as-is. */
export function normalizePosition(position: string | null | undefined): string {
  const upper = (position ?? '').trim().toUpperCase();
  return POSITION_ALIASES[upper] ?? upper;
}

/** The position's color, as a `var()` usable in any style or CSS property. */
export function positionColor(position: string | null | undefined): string {
  const token = POSITION_TOKENS[normalizePosition(position)] ?? '--pos-unknown';
  return `var(${token})`;
}

/** The same color as a translucent fill, for chips and row tints. */
export function positionSurface(position: string | null | undefined, percent = 15): string {
  return `color-mix(in oklab, ${positionColor(position)} ${percent}%, transparent)`;
}
