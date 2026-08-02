function optional(name: string): string | undefined {
  return process.env[name] || undefined;
}

export const env = {
  port: Number(process.env['PORT'] ?? 3001),
  sleeperUsername: optional('SLEEPER_USERNAME'),
  espnLeagueId: optional('ESPN_LEAGUE_ID'),
  espnSwid: optional('ESPN_SWID'),
  espnS2: optional('ESPN_S2'),
  espnSeason: Number(process.env['ESPN_SEASON'] ?? new Date().getFullYear()),
  debug: process.env['DEBUG'] === '1',
};
