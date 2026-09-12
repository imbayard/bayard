/**
 * Raw nflverse team-weekly-stats fixture — CSV text shaped exactly like what
 * `NflverseClient` would get back after gunzipping the real release asset, before any
 * parsing. `MockNflverseClient` (../nflverse-client.ts) serves it in place of the
 * multi-megabyte download, so mock mode never touches the network.
 *
 * The slate is graded: teams earlier in `TEAMS` hand over more (sacks, giveaways) and
 * score less, so the scout board has a real spread to sort rather than 32 identical rows.
 */

/** Softest offense to face first, toughest last — the intended rank order. */
const TEAMS = [
  'MIN', 'LV', 'NYJ', 'CLE', 'TEN', 'NO', 'CAR', 'NYG',
  'IND', 'PIT', 'MIA', 'ATL', 'ARI', 'WAS', 'JAX', 'CIN',
  'NE', 'TB', 'LAC', 'SEA', 'GB', 'BAL', 'KC', 'BUF',
  'PHI', 'SF', 'DAL', 'DEN', 'HOU', 'DET', 'CHI', 'LAR',
];

const WEEKS = 4;

const HEADER = [
  'season', 'week', 'team', 'season_type', 'opponent_team',
  'attempts', 'carries', 'sacks_suffered', 'passing_interceptions', 'fumbles_lost_total',
  'passing_tds', 'rushing_tds', 'passing_2pt_conversions', 'rushing_2pt_conversions',
  'fg_made', 'pat_made',
];

/**
 * One team's line for one week. `softness` runs 1 (softest) down to 0 (toughest) and
 * drives every stat; the `week` term keeps consecutive weeks from being identical.
 */
function row(season: number, week: number, team: string, softness: number): string {
  const wobble = week % 3;
  const touchdowns = Math.max(0, Math.round(4 * (1 - softness)) + (wobble === 1 ? 1 : 0));
  return [
    season,
    week,
    team,
    'REG',
    // The scout never reads opponent_team off this asset, but the real one always has it.
    TEAMS[(TEAMS.indexOf(team) + week) % TEAMS.length],
    30 + wobble,
    24 - wobble,
    Math.round(1 + 5 * softness),
    Math.round(2 * softness) + (wobble === 2 ? 1 : 0),
    softness > 0.6 ? 1 : 0,
    Math.max(0, touchdowns - 1),
    touchdowns > 0 ? 1 : 0,
    0,
    0,
    1 + wobble,
    touchdowns,
  ].join(',');
}

/**
 * The whole fixture, as CSV text. Season is a parameter only so the blended
 * prior-season call gets a plausible `season` column — the rows themselves are
 * identical year to year, which leaves blended ranks the same as unblended ones.
 */
export function teamWeekStatsCsv(season = new Date().getFullYear()): string {
  const lines = [HEADER.join(',')];
  for (let week = 1; week <= WEEKS; week++) {
    TEAMS.forEach((team, i) => {
      lines.push(row(season, week, team, 1 - i / (TEAMS.length - 1)));
    });
  }
  return `${lines.join('\n')}\n`;
}
