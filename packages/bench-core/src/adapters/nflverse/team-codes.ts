/**
 * Normalizes nflverse team abbreviations to the codes the rest of the app uses.
 *
 * We canonicalize on the standard Sleeper abbreviations (which match
 * `Player.nflTeam`) so nflverse aggregates key-join cleanly with roster data.
 * nflverse historically uses a few variants for relocated/renamed franchises:
 *   - `LA` / `STL`  -> `LAR`  (Rams; nflverse often writes bare `LA`)
 *   - `WSH`         -> `WAS`  (Commanders)
 *   - `JAC`         -> `JAX`  (Jaguars)
 *   - `OAK`         -> `LV`   (Raiders, pre-2020)
 *   - `SD`          -> `LAC`  (Chargers, pre-2017)
 * Unknown codes pass through uppercased so we never silently drop a team.
 */
const TEAM_CODE_MAP: Record<string, string> = {
  LA: 'LAR',
  LAR: 'LAR',
  STL: 'LAR',
  WAS: 'WAS',
  WSH: 'WAS',
  JAX: 'JAX',
  JAC: 'JAX',
  OAK: 'LV',
  LV: 'LV',
  SD: 'LAC',
  LAC: 'LAC',
};

export function normalizeTeamCode(raw: string): string {
  const key = raw.trim().toUpperCase();
  return TEAM_CODE_MAP[key] ?? key;
}
