function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

/** Comma-separated env var -> trimmed, de-duped list. */
function list(...names: string[]): string[] {
  const ids = names.flatMap((name) => (process.env[name] ?? '').split(',')).map((v) => v.trim());
  return [...new Set(ids.filter(Boolean))];
}

export const env = {
  port: Number(process.env['PORT'] ?? 3001),
  sleeperUsername: optional('SLEEPER_USERNAME'),
  /** ESPN_LEAGUE_IDS takes several; ESPN_LEAGUE_ID is the older single-league spelling. */
  espnLeagueIds: list('ESPN_LEAGUE_IDS', 'ESPN_LEAGUE_ID'),
  espnSwid: optional('ESPN_SWID'),
  espnS2: optional('ESPN_S2'),
  espnSeason: Number(process.env['ESPN_SEASON'] ?? new Date().getFullYear()),
  debug: process.env['DEBUG'] === '1',
  integrationsBaseUrl: process.env['INTEGRATIONS_BASE_URL'] ?? 'http://localhost:8000',
  /** Shared secret for the Coach backend's /analytics routes; unset locally, where they're open. */
  analyticsToken: optional('ANALYTICS_TOKEN'),
};
