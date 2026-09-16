import { Hono } from 'hono';
import { cache } from '../adapters.js';

/**
 * Keys a manual refresh deliberately spares. These are large, slow-moving payloads that
 * no roster move or score change can invalidate — Sleeper's player DB is several MB and
 * turns over once a day, and season totals only move when a week finishes. Re-downloading
 * them on every click would make the button feel worse than the staleness it fixes.
 */
const PRESERVED = [
  '/players/nfl', // Sleeper player DB, 24h
  '/stats/nfl/regular/', // Sleeper season totals, 6h
  'view=kona_player_info', // ESPN player pool, 24h
];

export const refresh = new Hono();

/**
 * Drop every volatile cache entry so the next read goes to the platform. The browser still
 * holds its own React Query cache — the client invalidates that itself after this returns.
 *
 * The cache is in-process, so on Netlify this clears the instance that happens to serve the
 * request. Fine for a single user hitting a warm function; the local dev server is one
 * process and always exact.
 */
refresh.post('/refresh', (c) => {
  const cleared = cache.deleteWhere((key) => !PRESERVED.some((p) => key.includes(p)));
  return c.json({ cleared });
});
